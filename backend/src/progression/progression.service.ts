import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { glyphRewardForLevel, levelForXp } from '../config/gameplay-rules';
import {
  journeyStageForProgress,
  hasReachedCityStage,
  questCardRarityForStage,
  JOURNEY_STAGES,
} from '../config/journey-stages';
import { AliService } from '../ali/ali.service';
import { NotificationService } from '../notifications/notification.service';
import { QuestCardService } from '../quest-card/quest-card.service';
import { playerLocalDate } from '../common/timezone';
import { isUniqueConstraintError } from '../common/prisma-errors';

/** Either the real PrismaService or the `tx` handle inside a $transaction callback — same query surface either way. */
type Db = PrismaService | Prisma.TransactionClient;

/** Matches the Consistency achievement thresholds (spec §6.2) — the days worth an ALI reaction, not every day. */
const STREAK_MILESTONE_DAYS = [7, 10, 30, 60, 90];

/**
 * The only writer of XP, Glyphs, Level, Journey, and streak. Quests
 * (and Battles, Word in the Wild, Shop, etc.) call these methods
 * instead of touching UserProgression or the ledgers directly — this is
 * what "backend is authoritative" actually looks like in code: one
 * choke point, not a rule everyone has to remember to follow.
 *
 * Every method takes an optional trailing `db` — pass the `tx` from a
 * `prisma.$transaction(async (tx) => ...)` callback when this call needs
 * to be atomic with other writes; omit it for a standalone call, which
 * just uses the real PrismaService.
 */
@Injectable()
export class ProgressionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ali: AliService,
    private readonly notifications: NotificationService,
    private readonly questCards: QuestCardService,
  ) {}

  async awardXp(
    userId: string,
    amount: number,
    reason: string,
    source: string,
    reference?: string,
    db: Db = this.prisma,
  ) {
    if (amount <= 0) return;

    try {
      await db.xpTransaction.create({
        data: { userId, amount, reason, source, reference },
      });
    } catch (err) {
      // V21 §10 "duplicate reward prevention": LEVEL_UP/JOURNEY_COMPLETION
      // are guarded by a partial unique index on (userId, reason,
      // reference) — see migration 20260823_..._ledger_dedup_index — so a
      // retried or racing award for the exact same level/stage crossing
      // is a safe idempotent no-op instead of double-paying. Every other
      // `reason` isn't covered by that index (many call sites legitimately
      // award the same reason more than once, e.g. BOSS_BATTLE_ANSWER once
      // per question) and this create() behaves exactly as before for them.
      if (isUniqueConstraintError(err)) return;
      throw err;
    }

    const progression = await db.userProgression.update({
      where: { userId },
      data: { totalXp: { increment: amount } },
    });

    const newLevel = levelForXp(progression.totalXp);
    if (newLevel === progression.level) return;

    // Final Core Progression Specification §3.4: a Glyph reward for
    // EVERY level crossed, not just the final one — a big XP grant can
    // legitimately jump several levels in one award.
    let levelGlyphReward = 0;
    for (let lvl = progression.level + 1; lvl <= newLevel; lvl++) {
      levelGlyphReward += glyphRewardForLevel(lvl);
    }

    await db.userProgression.update({ where: { userId }, data: { level: newLevel } });

    if (levelGlyphReward > 0) {
      await this.awardGlyphs(
        userId,
        levelGlyphReward,
        'LEVEL_UP',
        'progression',
        String(newLevel),
        db,
      );
    }

    this.ali.reactFireAndForget(userId, {
      type: 'LEVEL_UP',
      journeyStage: progression.journeyStage,
      context: { newLevel, glyphsAwarded: levelGlyphReward },
    });
    this.notifications.notifyFireAndForget(
      userId,
      'LEVEL_UP',
      `Level ${newLevel}!`,
      levelGlyphReward > 0
        ? `You reached Level ${newLevel} and earned ${levelGlyphReward} Glyphs.`
        : `You reached Level ${newLevel}.`,
      { data: { newLevel }, deepLink: 'wordquest://journey' },
    );

    await this.checkJourneyAdvancement(
      userId,
      newLevel,
      progression.journeyStage,
      progression.masteredWordsCount,
      db,
    );
  }

  async awardGlyphs(
    userId: string,
    amount: number,
    reason: string,
    source: string,
    reference?: string,
    db: Db = this.prisma,
  ) {
    if (amount <= 0) return;

    try {
      await db.glyphTransaction.create({
        data: { userId, amount, direction: 'CREDIT', reason, source, reference },
      });
    } catch (err) {
      // Same idempotent-no-op guard as awardXp above, for the same two
      // reasons (LEVEL_UP, JOURNEY_COMPLETION) — see that method's
      // comment for the full explanation.
      if (isUniqueConstraintError(err)) return;
      throw err;
    }

    await db.userProgression.update({
      where: { userId },
      data: { glyphBalance: { increment: amount } },
    });
  }

  /**
   * Atomic compare-and-decrement (Correction & Completion Spec §6: "make
   * spending atomic", "prevent race conditions", "protect ledger
   * integrity"). A plain read-then-write here — read glyphBalance,
   * check it in application code, THEN write the decrement — would let
   * two concurrent spends both pass the balance check before either one's
   * decrement lands, over-spending the player's balance (a classic
   * check-then-act race, and the exact bug this spec item calls out).
   *
   * updateMany's WHERE clause re-checks glyphBalance >= amount as part
   * of the SAME statement as the decrement, so Postgres only lets one of
   * two racing spends match — the loser's affected row count is 0 and
   * it's rejected instead of silently succeeding, no manual row locking
   * needed. The ledger row is only ever created after a successful
   * decrement, so an insufficient-balance spend never leaves an orphan
   * GlyphTransaction behind.
   */
  async spendGlyphs(
    userId: string,
    amount: number,
    reason: string,
    source: string,
    reference?: string,
    db: Db = this.prisma,
  ) {
    if (amount <= 0) return;

    const decremented = await db.userProgression.updateMany({
      where: { userId, glyphBalance: { gte: amount } },
      data: { glyphBalance: { decrement: amount } },
    });
    if (decremented.count === 0) {
      throw new Error('Insufficient Glyph balance');
    }

    await db.glyphTransaction.create({
      data: { userId, amount, direction: 'DEBIT', reason, source, reference },
    });
  }

  /**
   * Journey advances only when BOTH Level and masteredWordsCount clear
   * the next stage's gate (Final Core Progression Spec §2.2/§8) — and
   * only forward, never regresses if masteredWordsCount later drops via
   * a mastery demotion. Called from awardXp (Level side can change) AND
   * from MasteryService.recordAnswer (masteredWordsCount side can
   * change) — either one alone can be the thing that finally clears a
   * gate the other side already satisfied.
   *
   * Journey completion reward (spec §2.6): +5 Glyphs, +300 XP per stage
   * crossed, plus (below) a Quest Card, an ALI JOURNEY_COMPLETION
   * reaction, and a notification for every stage actually crossed.
   * "Badges" are the Achievement system (a prior pass's explicit
   * decision: Badges = Achievements, no separate badge feature) — this
   * method doesn't grant achievements itself since crossing a Journey
   * stage isn't on its own an achievement condition.
   */
  async checkJourneyAdvancement(
    userId: string,
    level: number,
    currentJourneyStage: number,
    masteredWordsCount: number,
    db: Db = this.prisma,
  ): Promise<void> {
    const newStage = journeyStageForProgress(level, masteredWordsCount);
    if (newStage <= currentJourneyStage) return;

    const stagesCrossed = newStage - currentJourneyStage;
    await db.userProgression.update({ where: { userId }, data: { journeyStage: newStage } });

    await this.awardGlyphs(
      userId,
      5 * stagesCrossed,
      'JOURNEY_COMPLETION',
      'progression',
      String(newStage),
      db,
    );
    await this.awardXp(
      userId,
      300 * stagesCrossed,
      'JOURNEY_COMPLETION',
      'progression',
      String(newStage),
      db,
    );

    this.ali.reactFireAndForget(userId, {
      type: 'JOURNEY_COMPLETION',
      journeyStage: newStage,
      context: { stageName: JOURNEY_STAGES[newStage]?.name, stagesCrossed },
    });
    this.notifications.notifyFireAndForget(
      userId,
      'JOURNEY_UNLOCK',
      JOURNEY_STAGES[newStage]?.name
        ? `Welcome to ${JOURNEY_STAGES[newStage]?.name}`
        : 'Journey stage unlocked',
      `You've advanced to a new stage of your journey.`,
      { data: { stage: newStage }, deepLink: 'wordquest://journey' },
    );

    // Permanent identity collectibles (Final Core Progression Spec §6.7)
    // — one card per stage actually crossed, not just the final one, so
    // a big XP grant that jumps several stages at once still leaves a
    // full record of each stage individually earned.
    for (let stage = currentJourneyStage + 1; stage <= newStage; stage++) {
      const def = JOURNEY_STAGES.find((s) => s.stage === stage);
      if (!def) continue;
      await this.questCards.createCard(
        userId,
        'JOURNEY_COMPLETION',
        def.key,
        `Reached ${def.name}`,
        undefined,
        db,
        { journeyStageKey: def.key, rarity: questCardRarityForStage(stage) },
      );
    }

    await this.checkCefrEligibility(userId, db);
  }

  /**
   * The CEFR unlock gate (Final Core Progression Spec §2.4): eligible
   * only once ALL FOUR hold together — City stage, 100 mastered words,
   * a 15-day consecutive activity streak, and 4 completed Boss
   * Battles. Idempotent (returns immediately once already unlocked) and
   * cheap (one read, early-exits on the first unmet condition), so it's
   * safe to call from every place any one of the four underlying values
   * can change, rather than needing a single central trigger.
   *
   * "Do not assign a meaningful CEFR level to a brand-new player merely
   * because an account exists" (spec) is satisfied by construction —
   * cefrUnlocked defaults to false and nothing here ever sets it before
   * every condition is independently verified.
   */
  async checkCefrEligibility(userId: string, db: Db = this.prisma): Promise<void> {
    const progression = await db.userProgression.findUniqueOrThrow({ where: { userId } });
    if (progression.cefrUnlocked) return;

    const eligible =
      hasReachedCityStage(progression.journeyStage) &&
      progression.masteredWordsCount >= 100 &&
      progression.currentStreak >= 15 &&
      progression.bossBattlesCompleted >= 4;

    if (!eligible) return;

    await db.userProgression.update({
      where: { userId },
      data: { cefrUnlocked: true, cefrUnlockedAt: new Date() },
    });

    this.notifications.notifyFireAndForget(
      userId,
      'CEFR_UNLOCK',
      'CEFR Level Unlocked',
      'Your CEFR proficiency estimate is now available on your Passport.',
      { deepLink: 'wordquest://profile' },
    );
  }

  /** A1..C2, ordinal 0..5 — the scale updateUnifiedCefrEstimate's components all get mapped onto before blending. */
  private static readonly CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

  private ordinalToCefr(ordinal: number): string {
    const idx = Math.max(0, Math.min(5, Math.round(ordinal)));
    return ProgressionService.CEFR_ORDER[idx];
  }

  /** Linearly maps a 0-100 AI dimension score onto the same 0-5 CEFR ordinal scale as the other components. */
  private scoreToOrdinal(score0to100: number): number {
    return Math.max(0, Math.min(5, (score0to100 / 100) * 5));
  }

  /**
   * Vocabulary growth's CEFR ordinal (V19 Stabilization Spec §13) — words
   * mastered is the only "vocabulary growth" signal this codebase
   * persists, so it's mapped onto the same 0-5 scale everything else
   * uses, piecewise-linear between band floors rather than a hard step
   * function, so it moves smoothly rather than jumping a full band the
   * instant a threshold is crossed. The floors deliberately echo
   * checkCefrEligibility's own 100-mastered-words gate (City stage + 100
   * words = roughly "B2/C1 territory" by this same curve) rather than
   * inventing an unrelated second scale.
   */
  private vocabularyGrowthOrdinal(masteredWordsCount: number): number {
    const bandFloors = [0, 10, 30, 60, 100, 150]; // words mastered at each CEFR band's floor
    let ordinal = 0;
    for (let i = 0; i < bandFloors.length; i++) {
      if (masteredWordsCount < bandFloors[i]) break;
      ordinal = i;
      const next = bandFloors[i + 1];
      if (next !== undefined) {
        ordinal = i + Math.min(1, (masteredWordsCount - bandFloors[i]) / (next - bandFloors[i]));
      }
    }
    return Math.min(5, ordinal);
  }

  /**
   * System-computed confidence (V19 Stabilization Spec §13's "confidence
   * scoring" — deliberately NOT the AI's own per-evaluation self-rating,
   * see CefrAssessment.confidence for that) blending two factors: how
   * much recent evidence exists (sampleFactor — maxes out once 5 recent
   * Sentence/Paragraph submissions are available, the same window the
   * rest of this method reads), and how much that evidence agrees with
   * itself (consistencyFactor — the five component ordinals' variance;
   * a player scoring consistently across vocabulary/writing/sentence/
   * paragraph/grammar is a level the evidence actually agrees on, one
   * where components are scattered across the scale is not).
   */
  private computeCefrConfidence(
    componentOrdinals: number[],
    recentSubmissionCount: number,
  ): number {
    const sampleFactor = Math.min(1, recentSubmissionCount / 5);
    const mean = componentOrdinals.reduce((sum, o) => sum + o, 0) / componentOrdinals.length;
    const variance =
      componentOrdinals.reduce((sum, o) => sum + (o - mean) ** 2, 0) / componentOrdinals.length;
    // Component ordinals span 0-5, so a variance around 2.5 (components
    // scattered across roughly the whole scale) is treated as the
    // consistency floor rather than trying to normalize against a
    // theoretical max that's rarely actually reached.
    const consistencyFactor = Math.max(0, 1 - variance / 2.5);
    const confidence = 0.4 * sampleFactor + 0.6 * consistencyFactor;
    return Math.max(0.05, Math.min(0.99, confidence));
  }

  /**
   * The official rolling CEFR estimate, blended from exactly the five
   * inputs V20 Beta Release Checklist §8 locks in for V1: Vocabulary
   * growth, Sentence performance, Paragraph performance, Grammar, and
   * Contextual usage (no speaking/pronunciation — that system was
   * removed entirely). Replaces the old paragraph-only "mode of the
   * last 5 paragraph labels" approach — that left Sentence quality and
   * Vocabulary growth with no ongoing influence on the number V1
   * actually shows, despite the spec naming both as required inputs.
   * Called after EITHER a Sentence or a Paragraph submission (not just
   * Paragraph), since Sentence performance is one of the five.
   *
   * Grammar and Contextual usage are tracked as two independent
   * components (each averaged from the `grammar` / `context` sub-scores
   * that both Sentence and Paragraph submissions already carry), not
   * blended into one — V20 §8 names them as separate required inputs,
   * and the earlier combined "grammarContext" component understated
   * a player who is strong on one but weak on the other. There is
   * deliberately no separate "writing ability" component: blending
   * Sentence and Paragraph performance into a sixth score double-counted
   * both of them in the weighted average without being one of the five
   * named inputs.
   *
   * Each component is mapped onto the same 0-5 (A1-C2) ordinal scale,
   * weighted equally (a component that has no evidence yet — e.g. no
   * Sentence submissions at all — is simply omitted from the blend
   * rather than defaulted to 0, so an early player isn't dragged toward
   * A1 by silence), then the weighted average is rounded back to a
   * letter. Still completely independent of checkCefrEligibility's
   * gated official unlock — this is "what the evidence currently
   * suggests," tracked regardless of unlock status, and never presented
   * as an exam result (spec §4.3's explicit warning).
   */
  async updateUnifiedCefrEstimate(userId: string, db: Db = this.prisma): Promise<void> {
    const [progression, recentAttempts] = await Promise.all([
      db.userProgression.findUniqueOrThrow({ where: { userId } }),
      db.questAttempt.findMany({
        where: {
          userId,
          OR: [
            { sentenceScores: { not: Prisma.JsonNull } },
            { paragraphScores: { not: Prisma.JsonNull } },
          ],
        },
        // QuestAttempt has no generic createdAt — startedAt is the closest analog (set once, at creation).
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: { sentenceScores: true, paragraphScores: true },
      }),
    ]);

    if (recentAttempts.length === 0) return; // no writing evidence yet — nothing to (re)compute

    const sentenceAverages: number[] = [];
    const paragraphAverages: number[] = [];
    const grammarAverages: number[] = [];
    const contextualUsageAverages: number[] = [];

    for (const attempt of recentAttempts) {
      if (attempt.sentenceScores) {
        const s = attempt.sentenceScores as unknown as {
          grammar: number;
          vocabulary: number;
          context: number;
          naturalness: number;
          clarity: number;
        };
        sentenceAverages.push(
          (s.grammar + s.vocabulary + s.context + s.naturalness + s.clarity) / 5,
        );
        grammarAverages.push(s.grammar);
        contextualUsageAverages.push(s.context);
      }
      if (attempt.paragraphScores) {
        const p = attempt.paragraphScores as unknown as {
          grammar: number;
          vocabulary: number;
          structure: number;
          flow: number;
          context: number;
        };
        paragraphAverages.push((p.grammar + p.vocabulary + p.structure + p.flow + p.context) / 5);
        grammarAverages.push(p.grammar);
        contextualUsageAverages.push(p.context);
      }
    }

    const average = (nums: number[]): number | null =>
      nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : null;

    const sentenceQuality = average(sentenceAverages);
    const paragraphQuality = average(paragraphAverages);
    const grammar = average(grammarAverages);
    const contextualUsage = average(contextualUsageAverages);

    const componentOrdinals: number[] = [
      this.vocabularyGrowthOrdinal(progression.masteredWordsCount),
    ];
    if (sentenceQuality !== null) componentOrdinals.push(this.scoreToOrdinal(sentenceQuality));
    if (paragraphQuality !== null) componentOrdinals.push(this.scoreToOrdinal(paragraphQuality));
    if (grammar !== null) componentOrdinals.push(this.scoreToOrdinal(grammar));
    if (contextualUsage !== null) componentOrdinals.push(this.scoreToOrdinal(contextualUsage));

    const weightedOrdinal =
      componentOrdinals.reduce((sum, o) => sum + o, 0) / componentOrdinals.length;
    const level = this.ordinalToCefr(weightedOrdinal);
    const confidence = this.computeCefrConfidence(componentOrdinals, recentAttempts.length);

    await db.userProgression.update({
      where: { userId },
      data: { estimatedCefrLevel: level, estimatedCefrConfidence: confidence },
    });

    await db.cefrAssessment.create({
      data: {
        userId,
        source: 'UNIFIED_ASSESSMENT',
        level,
        confidence,
        dimensions: {
          vocabularyGrowthOrdinal: componentOrdinals[0],
          sentenceQuality,
          paragraphQuality,
          grammar,
          contextualUsage,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Records that the player did something quest-worthy today. Streak math
   * is calendar-day based in the PLAYER'S OWN timezone (Player Timezone
   * System, V1 Remaining Systems Spec §15) — never a client-supplied date,
   * and never raw server UTC either (that was only ever a documented
   * stopgap; every player now has a stored IANA timezone to derive from,
   * defaulting to UTC only for an account that hasn't set one yet).
   *
   * `db.user` is guarded rather than assumed so narrower test doubles that
   * mock only `userProgression`/`xpTransaction`/`glyphTransaction` (this
   * method's pre-existing test surface) keep working — they fall back to
   * UTC, same as this method's behavior before timezones existed.
   *
   * Returns the current streak (whether it just changed or was already
   * recorded today) — QuestsService uses this to check Consistency
   * achievements right after calling this, without a second read.
   */
  async recordDailyActivity(
    userId: string,
    db: Db = this.prisma,
  ): Promise<{ currentStreak: number }> {
    const progression = await db.userProgression.findUniqueOrThrow({ where: { userId } });
    const user = db.user
      ? await db.user.findUnique({ where: { id: userId }, select: { timezone: true } })
      : null;
    const tz = user?.timezone ?? null;
    const now = new Date();

    // `today`/`lastActive` here are identity-boxed local-date strings, used
    // ONLY for the day-arithmetic comparisons below — never written back.
    // lastActiveOn itself always stores a real instant (`now`), so a later
    // read re-derives the correct local date for whatever timezone the
    // player has at THAT time (handles a player who changes timezone).
    const today = this.localDateIdentity(playerLocalDate(tz, now));
    const lastActive = progression.lastActiveOn
      ? this.localDateIdentity(playerLocalDate(tz, progression.lastActiveOn))
      : null;

    if (lastActive && lastActive.getTime() === today.getTime()) {
      return { currentStreak: progression.currentStreak }; // already counted today
    }

    const isConsecutive =
      lastActive !== null && today.getTime() - lastActive.getTime() === 24 * 60 * 60 * 1000;

    const newStreak = isConsecutive ? progression.currentStreak + 1 : 1;

    await db.userProgression.update({
      where: { userId },
      data: {
        currentStreak: newStreak,
        longestStreak: Math.max(newStreak, progression.longestStreak),
        lastActiveOn: now,
      },
    });

    // Milestone days only (matches the Consistency achievement
    // thresholds) — a reaction every single day would be noise, not a
    // narrator responding to something noteworthy.
    if (STREAK_MILESTONE_DAYS.includes(newStreak)) {
      this.ali.reactFireAndForget(userId, {
        type: 'STREAK_MILESTONE',
        journeyStage: progression.journeyStage,
        context: { streakDays: newStreak },
      });
    }

    await this.checkCefrEligibility(userId, db);

    return { currentStreak: newStreak };
  }

  /**
   * Boxes a "YYYY-MM-DD" local-date string as a UTC-midnight Date purely
   * as a comparable/diffable identity — never a real instant, never
   * written back to the database. Both sides of every comparison in this
   * file go through the same conversion, so the arbitrary UTC anchor
   * cancels out; it's just a stable way to do "is this exactly one
   * calendar day after that" arithmetic.
   */
  private localDateIdentity(localDateStr: string): Date {
    return new Date(`${localDateStr}T00:00:00.000Z`);
  }
}
