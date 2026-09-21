/**
 * Centralized, versioned gameplay tuning — XP curve, per-answer/quest
 * rewards, mastery thresholds. Deliberately separate from configuration.ts
 * (deploy-time env config): these are design numbers a game designer
 * should be able to change without touching secrets/infra config
 * (BUILD_HANDOFF §24 "XP thresholds should be configurable", §46).
 *
 * `version` exists so a future scoring change can be attributed on
 * historical XpTransaction/ChallengeAttempt rows if it ever matters.
 */
export const GAMEPLAY_RULES_VERSION = 1;

export const gameplayRules = {
  xp: {
    perCorrectAnswer: 10,
    perIncorrectAnswer: 0,
    questCompletionBonus: 50,
    // Level N requires cumulative XP >= levelThresholds[N-1]. Index 0 = Level 1 (0 XP).
    // Final Core Progression Specification §3.2 — the authoritative
    // 100-level v1.0 curve, exact values (not a formula). Index 0 = Level 1.
    levelThresholds: [
      0, 6160, 12459, 18899, 25484, 32217, 39101, 46140, 53337, 60696, 68220, 75913, 83779, 91822,
      100046, 108454, 117052, 125842, 134830, 144020, 153417, 163024, 172848, 182892, 193162,
      203663, 214400, 225378, 236603, 248080, 259815, 271813, 284081, 296625, 309451, 322565,
      335973, 349683, 363701, 378034, 392689, 407674, 422995, 438660, 454677, 471055, 487800,
      504922, 522428, 540328, 558630, 577343, 596476, 616040, 636043, 656496, 677409, 698791,
      720654, 743008, 765864, 789234, 813129, 837561, 862542, 888085, 914201, 940904, 968208,
      996124, 1024669, 1053854, 1083696, 1114207, 1145405, 1177304, 1209919, 1243267, 1277365,
      1312229, 1347876, 1384325, 1421592, 1459697, 1498658, 1538495, 1579226, 1620873, 1663456,
      1706996, 1751514, 1797032, 1843574, 1891161, 1939817, 1989567, 2040435, 2092446, 2145625,
      2200000,
    ],
  },
  glyphs: {
    questCompletionReward: 10,
  },
  /**
   * Word in the Wild (V1 Final Systems Spec §3.7 — supersedes the
   * earlier ad-hoc 30 XP/15 Glyph values). "Up to 6 uploads/day,
   * maximum 100 XP each, daily maximum 600 XP" and "no unlimited
   * farming: daily caps... are mandatory" — dailySubmissionCap is that
   * mandatory cap, enforced in WordInTheWildService before a new
   * submission is created, not just documented here.
   */
  wordInTheWild: {
    dailySubmissionCap: 6,
    xpPerApproval: 100,
    glyphsPerApproval: 15,
  },
  mastery: {
    // Consecutive-correct-streak thresholds that promote a word up the
    // NEW → RECOGNIZING → RECALLING → STRONG ladder (display level only —
    // Vocabulary Engine spec §16). A miss demotes by exactly one rung and
    // resets the streak — never straight back to NEW — per spec §15's
    // instruction not to swing difficulty too aggressively off a single
    // wrong answer.
    //
    // IMPORTANT (V1 Remaining Systems Spec §4 — "the Mastery Engine
    // becomes the single source of truth"): streakForMastered is NOT a
    // path to the MASTERED level anymore. A streak alone — Boss Battle,
    // Word in the Wild, or ordinary Guess-stage answers — can only ever
    // promote a word up to STRONG. MASTERED requires every one of the
    // three skill areas below (guess/sentence/paragraph — Speaking/
    // Pronunciation were removed from V1 entirely, Correction &
    // Completion Spec §1-2) independently at or above
    // skillAreaMasteryThresholdPercent — see
    // MasteryService.evaluateWordCycleCompletion, the single place that
    // decides MASTERED.
    streakForRecognizing: 1,
    streakForRecalling: 2,
    streakForStrong: 4,
    streakForMastered: 6, // now just "a very strong streak" for guessScore purposes — see computeGuessScore
    // masteryScore delta per answer, clamped to [0, 100]. masteryScore is
    // a display/ranking aggregate only — it does not gate MASTERED.
    scoreDeltaCorrect: 15,
    scoreDeltaIncorrect: -10,
    // V1 Remaining Systems Spec §4: "mastery must ONLY occur when EVERY
    // required skill area reaches 75% or higher." Applied independently
    // to each of guessScore/sentenceScore/paragraphScore on Mastery —
    // not a weighted average, not "most of them," every single one.
    skillAreaMasteryThresholdPercent: 75,
  },
  quest: {
    // Volume 1&2 spec §3: "one word per quest period," not a batch.
    defaultWordCount: 1,
    multipleChoiceOptionCount: 4,
  },
  /**
   * The Guess stage's XP economy — V1 Final Systems Spec §3.3. This
   * REPLACES the earlier flat perCorrectAnswer model: XP is now a
   * time-bonus-driven score, reduced by assistance penalties, with a
   * clean-run bonus, clamped to a participation floor and hard cap.
   *
   * Exact time-bonus cutoffs aren't given in the spec, only the 5 bonus
   * values (750/500/250/100/0) "by remaining time band" over the
   * 120-second timer — timeBonusBands below splits that evenly into
   * five 24-second bands as a reasonable interpretation. Tune via this
   * config if real playtesting suggests different cutoffs; nothing
   * downstream hard-codes these numbers.
   */
  guessStage: {
    timerSeconds: 120,
    maxXp: 750,
    participationFloor: 100,
    wrongAttemptPenalty: 50,
    hintPenalty: 50,
    maxHints: 4,
    synonymPenalty: 100,
    maxSynonyms: 2,
    letterRevealPenalty: 150,
    noHintBonus: 500,
    timeBonusBands: [
      { maxElapsedSeconds: 24, bonus: 750 },
      { maxElapsedSeconds: 48, bonus: 500 },
      { maxElapsedSeconds: 72, bonus: 250 },
      { maxElapsedSeconds: 96, bonus: 100 },
      { maxElapsedSeconds: 120, bonus: 0 },
    ],
  },
  /**
   * Letter-omission reveal/remove ranges per mastery level (spec §9) —
   * "initial estimates only... eventually adjusted using real player
   * performance data." Expressed as the fraction of letters REMOVED
   * (spec gives reveal %, remove % is just its complement); the omission
   * engine picks a random point inside the range on every challenge so
   * the same word never blanks the same way twice (spec §7/§11).
   */
  /**
   * Letter-omission percentage model per Volume 1&2 spec §8/§9: a fixed
   * 40% baseline for a NEW/novice player, a fixed 90% target once
   * MASTERED, with the three intermediate mastery levels interpolated
   * evenly between those two endpoints (see
   * omission-engine.ts's omissionFractionForLevel). This is
   * DETERMINISTIC by mastery level — it replaces an earlier per-level
   * random min/max range design. What still varies between two
   * presentations of the same word is WHICH letters get blanked (the
   * pattern strategies below), never HOW MANY — that was always a
   * separate concern (spec v1 §7/§11's "must not be predictable" is
   * about position, and nothing here overrides it).
   */
  omission: {
    noviceBaselineFraction: 0.4,
    masteredTargetFraction: 0.9,
    // Safety net (spec §9: "preserve enough information for a valid,
    // solvable challenge"): never blank so much of a short word that
    // there's nothing left to reconstruct from. This can still cap the
    // nominal 90% MASTERED target down on short words — that's expected,
    // not a bug.
    minRevealedLetters: 2,
  },
  /**
   * Boss Battle (spec v1.0). Reward tiers must be configurable from the
   * backend, never hard-coded in the client (§13) — this object is that
   * configuration point. bossBattle XP/rewards are separate from
   * ordinary quest XP: a correct answer during a battle is worth more,
   * reflecting the competitive stakes, and still feeds real lifetime XP
   * via ProgressionService exactly like any other correct answer (§20)
   * — battleXp on BossBattlePlayer is an ADDITIONAL ranking-only ledger,
   * not a replacement for it.
   */
  /**
   * Boss Battle (V1 Final Systems Spec §8.7 — supersedes the earlier
   * 6-tier structure this codebase had). Flat placement tiers: 1st/2nd/
   * 3rd get a specific reward, everyone else gets the same flat
   * participation reward — not additive with a placement tier.
   */
  bossBattle: {
    // §14: "initial intent" eligibility, explicitly anticipating more
    // dimensions later (minimum completed quests, account age, etc.) —
    // this is the one built for MVP, kept as its own configurable knob
    // rather than hard-coded into the join check itself.
    minLevelToJoin: 2,
    perCorrectAnswer: 15,
    perIncorrectAnswer: 0,
    rewards: {
      first: { xp: 3000, glyphs: 10 },
      second: { xp: 2000, glyphs: 5 },
      third: { xp: 1000, glyphs: 3 },
      participation: { xp: 200, glyphs: 0 }, // 4th place and below
    },
    // How long a group stays open to new joins before it's sealed and its
    // shared word sequence is generated (V1 Remaining Systems Spec §13:
    // every player in a group gets the SAME words in the SAME order).
    sharedSequenceLength: 20,
    // How often the auto-finalization sweep runs (BossBattleFinalizerService)
    // — a battle concludes on this schedule even if no client ever calls
    // an endpoint for it (spec §13's "must conclude automatically").
    autoFinalizeCronExpression: '*/2 * * * *', // every 2 minutes
    // V21 §5 "reward duplication prevention": a group claimed into
    // FINALIZING (see BossBattleService.finalizeGroupIfNeeded) that
    // never reaches COMPLETED — the process crashed mid-reward-loop —
    // is eligible for the auto-finalize sweep to re-claim once it's
    // been stuck this long. Generous over how long a <=20-player reward
    // loop could plausibly take, so a legitimately-still-running
    // finalization is never re-claimed out from under itself.
    finalizationStuckThresholdMs: 5 * 60 * 1000, // 5 minutes
  },
  /**
   * Authentication (V1 Remaining Systems Spec §14). "Verification
   * blocking" is enforced as a grace period, not an immediate hard lock —
   * a brand-new account has full gameplay access for this many days, then
   * gameplay-affecting endpoints require emailVerifiedAt to be set. Auth,
   * profile/settings, and resend-verification stay open always (see
   * EmailVerificationGuard) — a lapsed-grace user is never fully locked
   * out of the app, only out of earning progress.
   */
  auth: {
    emailVerificationGraceDays: 3,
    // Age gate (COPPA): the minimum age, in whole years as of today,
    // required to register. Registration is rejected below this —
    // see common/age.ts (calculateAge) and AuthService.register. 13
    // is the COPPA line in the US (the default this product targets,
    // per the privacy policy); revisit per-region if WordQuest ever
    // needs a stricter EU/UK-style 16 minimum for a specific market.
    minimumAgeYears: 13,
    // Account lockout (Sprint 5 "Authentication hardening") — a
    // complement to the per-IP @Throttle limits on the auth endpoints,
    // which alone don't stop guesses against one account spread across
    // many IPs. See User.failedLoginAttempts/lockedUntil.
    maxFailedLoginAttempts: 5,
    lockoutDurationMinutes: 15,
    // Absolute session lifetime (V20 Beta Release Checklist §12: Session
    // security). Refresh-token rotation alone has no natural end — every
    // successful refresh re-issues a fresh 30-day-expiring token, so a
    // session kept alive by periodic use (the legitimate owner, or an
    // attacker with a stolen refresh token quietly refreshing in the
    // background) could otherwise persist indefinitely. sessionStartedAt
    // is carried forward unchanged across every rotation in a chain
    // (see AuthService.issueTokens/refresh) precisely so this cap can be
    // enforced against the ORIGINAL login, not reset on every refresh.
    // Deliberately generous (not a short idle timeout) — the concurrent-
    // device/session count itself stays uncapped by design; this is only
    // the outer security floor forcing a fresh login eventually.
    absoluteSessionLifetimeDays: 90,
    // Expired auth tokens (refresh/email-verification/password-reset)
    // are never read again once past expiresAt — this just reclaims
    // the storage on a schedule, same @Cron pattern as
    // BossBattleService's autoFinalizeCronExpression.
    tokenCleanupCronExpression: '0 3 * * *', // daily at 03:00 server time
  },
  /**
   * Adaptive Word Selection (V1 Remaining Systems Spec §3) — relative
   * weights the selection ranking combines (see
   * WordsService.rankCandidatesForSelection). Not a probability
   * distribution; just relative importance, re-normalized inside the
   * ranking function. Tune here, not by editing the ranking formula.
   */
  /**
   * Adaptive AI Learning Engine weakness detection (Correction &
   * Completion Spec §6: "improve weakness detection", "connect all
   * available learning signals") — the thresholds LearningProfileService
   * uses to flag a skill area as a current weakness. skillAreaWeaknessPercent
   * is on the same 0-100 scale as the Skill Radar/Mastery skill-area
   * scores; hintDependencyWeaknessRate is 0-1 (share of available hints
   * actually used, EMA-smoothed).
   */
  learningProfile: {
    skillAreaWeaknessPercent: 60,
    hintDependencyWeaknessRate: 0.5,
  },
  adaptiveSelection: {
    reviewDueWeight: 3, // words at/past nextReviewDueAt rank highest — spaced repetition is the primary driver
    forgettingRiskWeight: 2,
    cefrProximityWeight: 2, // how close a word's cefrLevel is to the player's currentDifficulty/estimatedCefrLevel
    categoryVarietyWeight: 1, // mild bonus for categories the player has seen less recently
    // Category performance (V20 Beta Release Checklist §3 required AI
    // input, distinct from categoryVarietyWeight above): scaled by the
    // player's overall incorrect rate WITHIN that category across every
    // attempt at any mastery level, not just how many words they've
    // mastered in it — a category the player is currently struggling
    // with should resurface more, the same "struggle -> more practice"
    // principle struggleWeight already applies per-word, applied at the
    // category level instead.
    categoryPerformanceWeight: 1.5,
    difficultyScoreWeight: 1,
    // Previous encounters (V19 Stabilization Spec §3) — scaled by the
    // word's own historical incorrect rate (timesIncorrect/timesPresented),
    // so a word the player consistently gets wrong resurfaces more, on
    // top of (not instead of) the spaced-repetition review-due signal.
    struggleWeight: 2,
    // A word already MASTERED is never re-served by the normal picker
    // (existing behavior, unchanged); a STRONG word is heavily
    // deprioritized but not excluded, so it still resurfaces for spaced
    // review rather than disappearing until an explicit review flow asks
    // for it.
    strongWordPenalty: 5,
    // Spaced-repetition review interval by mastery level, in days — how
    // long after lastReviewedAt a word's nextReviewDueAt is set to. Short
    // for a word the player barely knows, long once it's STRONG/MASTERED.
    reviewIntervalDaysByLevel: {
      NEW: 1,
      RECOGNIZING: 2,
      RECALLING: 4,
      STRONG: 9,
      MASTERED: 21,
    },
  },
  /**
   * The Notification Engine's time-based/scheduled triggers (V1 Remaining
   * Systems Spec §15/§19) — as opposed to the event-driven ones (level-up,
   * achievement unlock, etc.) that fire straight from the module whose
   * event just happened. These run on their own @Cron schedule in
   * NotificationSchedulerService, one player-local hour check at a time —
   * quiet hours and category preferences are still enforced downstream by
   * NotificationService, this only decides *whether the moment is right*.
   */
  notificationScheduler: {
    // Hourly is the coarsest granularity that still lets an
    // hour-boundary quest window or the fixed reviewReminderLocalHour
    // fire within the hour it's meant to, without a dedicated per-minute
    // job for something this infrequent.
    hourlyCronExpression: '0 * * * *',
    // Fixed player-local hour the daily review nudge fires at, when the
    // player has at least one word due. A configurable per-player
    // reminder time is future work, not a v1 requirement.
    reviewReminderLocalHour: 9,
    // Boss Battle reminder cadence and lead time — checked every 15
    // minutes; a battle window starting in [55,70) minutes gets exactly
    // one match at this cadence, which is what keeps this a single
    // reminder instead of a repeating one every tick.
    bossBattleReminderCronExpression: '*/15 * * * *',
    bossBattleReminderLeadMinutesMin: 55,
    bossBattleReminderLeadMinutesMax: 70,
    // WEAK_SKILL_REMINDER (Correction & Completion Spec §6) — fixed
    // player-local hour, separate from reviewReminderLocalHour so the two
    // nudges don't land in the same push at once; a multi-day cooldown
    // (checked against the most recent WEAK_SKILL_REMINDER Notification
    // row for that player, per the existing-table-as-anti-repeat-state
    // pattern — no new schema needed) so a standing weakness doesn't
    // nag every single day.
    weakSkillReminderLocalHour: 18,
    weakSkillReminderCooldownDays: 3,
    // FORGETTING_CURVE_REMINDER (Correction & Completion Spec §6) — the
    // richer, ALI-voiced sibling of the generic REVIEW_REMINDER above;
    // only fires for words at/above this forgetting-risk cutoff (see
    // vocabulary/review-schedule.ts's computeForgettingRisk, 0-1, 0.6 at
    // the scheduled due date), and only once per cooldown window per
    // player so it doesn't compete with the daily generic reminder.
    forgettingCurveReminderLocalHour: 19,
    forgettingCurveReminderCooldownDays: 2,
    forgettingCurveRiskThreshold: 0.75,
    // LEADERBOARD_UPDATE (Correction & Completion Spec §6) — checked once
    // a day per player; notifies on entering the top-N global ranks, or
    // on climbing at least rankImprovementThreshold places since the
    // last leaderboard notification sent (the "last known rank" is read
    // back from that notification's own `data.rank`, per the
    // existing-table-as-anti-repeat-state pattern — no rank-history
    // table needed).
    leaderboardCheckLocalHour: 20,
    leaderboardCheckCooldownDays: 1,
    leaderboardTopRankThreshold: 10,
    leaderboardRankImprovementThreshold: 5,
  },
} as const;

/**
 * True if the player leaned on ANY Guess-stage assistance — a hint, a
 * synonym, or a letter reveal. Shared by computeGuessXp (the "clean run"
 * bonus below) and AchievementService.checkIndependentLearning (V1
 * Remaining Systems Spec §6.3's "no hints, synonyms, or non-free letter
 * reveals" independent-quest definition — Correction & Completion Spec
 * §6: "ensure independent learning achievements check actual hint/
 * synonym/reveal usage") so both agree on exactly the same definition of
 * "independent," rather than each maintaining its own copy that could
 * drift apart.
 */
export function usedAnyGuessAssistance(params: {
  hintsUsed: number;
  synonymsUsed: number;
  lettersRevealed: number;
}): boolean {
  return params.hintsUsed > 0 || params.synonymsUsed > 0 || params.lettersRevealed > 0;
}

/**
 * The Guess stage's XP formula (V1 Final Systems Spec §3.3): a time
 * bonus by how quickly the player answered, reduced by assistance
 * penalties (wrong attempts, hints, synonyms, letter reveals), plus a
 * flat bonus for a completely clean run, clamped to
 * [participationFloor, maxXp]. Pure and deterministic — no randomness,
 * no DB access — so every input combination is exactly reproducible.
 */
export function computeGuessXp(params: {
  elapsedSeconds: number;
  wrongAttempts: number;
  hintsUsed: number;
  synonymsUsed: number;
  lettersRevealed: number;
}): number {
  const { guessStage } = gameplayRules;
  const band =
    guessStage.timeBonusBands.find((b) => params.elapsedSeconds <= b.maxElapsedSeconds) ??
    guessStage.timeBonusBands[guessStage.timeBonusBands.length - 1];

  const penalties =
    params.wrongAttempts * guessStage.wrongAttemptPenalty +
    params.hintsUsed * guessStage.hintPenalty +
    params.synonymsUsed * guessStage.synonymPenalty +
    params.lettersRevealed * guessStage.letterRevealPenalty;

  const noHintBonus = usedAnyGuessAssistance(params) ? 0 : guessStage.noHintBonus;

  const raw = band.bonus - penalties + noHintBonus;
  return clamp(raw, guessStage.participationFloor, guessStage.maxXp);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function levelForXp(totalXp: number): number {
  const { levelThresholds } = gameplayRules.xp;
  let level = 1;
  for (let i = 0; i < levelThresholds.length; i++) {
    if (totalXp >= levelThresholds[i]) level = i + 1;
  }
  return level;
}

/** Boss Battle placement (spec v1.0 §13): 1st -> highest tier down to 11th-20th -> participation. */
/** Boss Battle placement (V1 Final Systems Spec §8.7): 1st/2nd/3rd get a specific tier, everyone else (4th+) gets the flat participation reward. */
export function bossBattleRewardForRank(rank: number): { xp: number; glyphs: number } {
  const { rewards } = gameplayRules.bossBattle;
  if (rank === 1) return rewards.first;
  if (rank === 2) return rewards.second;
  if (rank === 3) return rewards.third;
  return rewards.participation;
}

/**
 * Final Core Progression Specification §3.4: Glyphs granted once per
 * level, by ten-level tier. Level 1 grants nothing (there's no "up" to
 * reward when it's the starting level).
 */
export function glyphRewardForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level <= 10) return 2;
  if (level <= 20) return 3;
  if (level <= 30) return 4;
  if (level <= 40) return 5;
  if (level <= 50) return 6;
  if (level <= 60) return 7;
  if (level <= 70) return 8;
  if (level <= 80) return 9;
  if (level <= 90) return 10;
  return 12;
}
