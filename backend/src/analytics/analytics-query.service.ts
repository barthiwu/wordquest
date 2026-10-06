import { Injectable } from '@nestjs/common';
import { ArcadeGame } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface OverviewStats {
  registeredUsers: number;
  /** Distinct userId with at least one analytics event in the window —
   * this app's stand-in for "active user" until a dedicated session
   * model exists. */
  activeUsersLast24h: number;
  activeUsersLast7d: number;
  /** Legacy event name (see event-names.ts's doc comment) — kept
   * alongside questsStarted below rather than merged into it, since
   * this one is server-authoritative (QuestsService.completeWord) while
   * questsStarted is client-reported. */
  questsCompleted: number;
  /** QUEST_STARTED (spec §9), client-reported from DailyQuestScreen once
   * the challenge actually loads — added once that instrumentation
   * shipped; a rough "start rate" is questsCompleted / questsStarted,
   * though the two aren't from the same source (one server, one
   * client) so treat it as directional, not exact. */
  questsStarted: number;
  bossBattlesJoined: number;
  shopPurchases: number;
  /** ARCADE_SESSION_STARTED (spec §11), client-reported from
   * ScrambleQuestScreen/CompleteItScreen — Word Duel isn't included
   * here since it has its own dedicated dashboard (getWordDuelDashboard
   * below) sourced from ground-truth match data instead. */
  arcadeSessionsStarted: number;
}

export interface WordDuelDashboardStats {
  matchesWaiting: number;
  matchesActive: number;
  matchesCompleted: number;
  /** Only ever set today when a WAITING match's own creator times out
   * with no opponent (see WordDuelService.joinQueue's stale-match
   * handling) — an ACTIVE match a player walks away from mid-duel
   * instead just runs out its clock and finalizes as COMPLETED with
   * that player's remaining words uncounted. So this number is a
   * floor on "matchmaking never found an opponent," not a measure of
   * mid-match abandonment (that would need the client's own
   * DUEL_ABANDONED event, which analytics_events does carry but this
   * endpoint doesn't aggregate — a v2 of this dashboard could). */
  matchesAbandonedWaiting: number;
  totalAnswers: number;
  correctAnswers: number;
  correctRate: number | null;
  avgCluesUsed: number | null;
  avgResponseTimeMs: number | null;
  /** Cumulative "reached at least this clue" funnel (spec Dashboard 3's
   * "Clue 1 usage / Clue 2 usage / ... / Clue 5 usage") — clueUsage[k]
   * is the fraction of answers with cluesRevealed >= k, for k in 1..5.
   * Sourced straight from WordDuelAnswer.cluesRevealed, the same
   * server-authoritative counter requestClue() increments — not from
   * analytics_events, so this number holds up even across an
   * analytics-ingestion outage. */
  clueUsage: { clueNumber: number; fraction: number }[];
}

export interface ArcadeGameDashboardStats {
  sessionsActive: number;
  sessionsCompleted: number;
  sessionsAbandoned: number;
  totalAnswers: number;
  correctAnswers: number;
  correctRate: number | null;
  avgHintsUsed: number | null;
  avgResponseTimeMs: number | null;
}

/**
 * ScrambleQuest/Complete It/Hangman, ground-truth (ArcadeGameSession/
 * ArcadeAnswer, not analytics_events) — same reasoning as
 * WordDuelDashboardStats above. Word Duel is excluded even though it
 * shares the ArcadeGame enum: it isn't an ArcadeGameSession row (see
 * that model's doc comment in schema.prisma) and already has its own
 * dedicated dashboard.
 */
export interface ArcadeDashboardStats {
  scrambleQuest: ArcadeGameDashboardStats;
  completeIt: ArcadeGameDashboardStats;
  hangman: ArcadeGameDashboardStats;
}

/**
 * Admin/support-only read layer for the "what are players doing"
 * questions the Telemetry spec's acceptance criteria (§32) actually
 * asks — deliberately NOT a general-purpose analytics_events query
 * builder. Word Duel numbers come straight from WordDuelMatch/
 * WordDuelAnswer (ground truth, spec Dashboard 3's flagship surface);
 * the overview only surfaces counts this app already reliably emits
 * today rather than a full V1 Overview with several always-zero rows.
 */
@Injectable()
export class AnalyticsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(): Promise<OverviewStats> {
    const now = Date.now();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
      registeredUsers,
      activeLast24h,
      activeLast7d,
      questsCompleted,
      questsStarted,
      bossBattlesJoined,
      shopPurchases,
      arcadeSessionsStarted,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.analyticsEvent.groupBy({
        by: ['userId'],
        where: { userId: { not: null }, createdAt: { gte: last24h } },
      }),
      this.prisma.analyticsEvent.groupBy({
        by: ['userId'],
        where: { userId: { not: null }, createdAt: { gte: last7d } },
      }),
      this.prisma.analyticsEvent.count({ where: { eventName: 'quest_completed' } }),
      this.prisma.analyticsEvent.count({ where: { eventName: 'QUEST_STARTED' } }),
      this.prisma.analyticsEvent.count({ where: { eventName: 'boss_battle_joined' } }),
      this.prisma.analyticsEvent.count({ where: { eventName: 'shop_purchase' } }),
      this.prisma.analyticsEvent.count({ where: { eventName: 'ARCADE_SESSION_STARTED' } }),
    ]);

    return {
      registeredUsers,
      activeUsersLast24h: activeLast24h.length,
      activeUsersLast7d: activeLast7d.length,
      questsCompleted,
      questsStarted,
      bossBattlesJoined,
      shopPurchases,
      arcadeSessionsStarted,
    };
  }

  async getWordDuelDashboard(): Promise<WordDuelDashboardStats> {
    const [matchesByStatus, answerAgg, correctCount, cluesBreakdown] = await Promise.all([
      this.prisma.wordDuelMatch.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.wordDuelAnswer.aggregate({
        _avg: { cluesRevealed: true, responseTimeMs: true },
        _count: { _all: true },
      }),
      this.prisma.wordDuelAnswer.count({ where: { isCorrect: true } }),
      this.prisma.wordDuelAnswer.groupBy({ by: ['cluesRevealed'], _count: { _all: true } }),
    ]);

    const countFor = (status: string) =>
      matchesByStatus.find((row) => row.status === status)?._count._all ?? 0;
    const totalAnswers = answerAgg._count._all;

    // cluesBreakdown gives "exactly N clues used" per row; clueUsage
    // wants the CUMULATIVE "at least N" funnel, so this sums downward
    // from 5 to 1 rather than reporting each bucket in isolation.
    const exactCounts = new Map<number, number>();
    for (const row of cluesBreakdown) {
      exactCounts.set(row.cluesRevealed, row._count._all);
    }
    const clueUsage: { clueNumber: number; fraction: number }[] = [];
    let cumulative = 0;
    for (let clueNumber = 5; clueNumber >= 1; clueNumber--) {
      cumulative += exactCounts.get(clueNumber) ?? 0;
      clueUsage.unshift({
        clueNumber,
        fraction: totalAnswers > 0 ? cumulative / totalAnswers : 0,
      });
    }
    // exactCounts may also hold a 0 bucket (no clues used) which
    // correctly contributes to every clueNumber's cumulative count
    // above without needing its own funnel row.

    return {
      matchesWaiting: countFor('WAITING'),
      matchesActive: countFor('ACTIVE'),
      matchesCompleted: countFor('COMPLETED'),
      matchesAbandonedWaiting: countFor('ABANDONED'),
      totalAnswers,
      correctAnswers: correctCount,
      correctRate: totalAnswers > 0 ? correctCount / totalAnswers : null,
      avgCluesUsed: answerAgg._avg.cluesRevealed,
      avgResponseTimeMs: answerAgg._avg.responseTimeMs,
      clueUsage,
    };
  }

  async getArcadeDashboard(): Promise<ArcadeDashboardStats> {
    const [scrambleQuest, completeIt, hangman] = await Promise.all([
      this.getArcadeGameStats('SCRAMBLE_QUEST'),
      this.getArcadeGameStats('COMPLETE_IT'),
      this.getArcadeGameStats('HANGMAN'),
    ]);
    return { scrambleQuest, completeIt, hangman };
  }

  private async getArcadeGameStats(game: ArcadeGame): Promise<ArcadeGameDashboardStats> {
    const [sessionsByStatus, answerAgg, correctCount] = await Promise.all([
      this.prisma.arcadeGameSession.groupBy({
        by: ['status'],
        where: { game },
        _count: { _all: true },
      }),
      this.prisma.arcadeAnswer.aggregate({
        where: { session: { game } },
        _avg: { hintsUsed: true, responseTimeMs: true },
        _count: { _all: true },
      }),
      this.prisma.arcadeAnswer.count({ where: { session: { game }, isCorrect: true } }),
    ]);

    const countFor = (status: string) =>
      sessionsByStatus.find((row) => row.status === status)?._count._all ?? 0;
    const totalAnswers = answerAgg._count._all;

    return {
      sessionsActive: countFor('ACTIVE'),
      sessionsCompleted: countFor('COMPLETED'),
      sessionsAbandoned: countFor('ABANDONED'),
      totalAnswers,
      correctAnswers: correctCount,
      correctRate: totalAnswers > 0 ? correctCount / totalAnswers : null,
      avgHintsUsed: answerAgg._avg.hintsUsed,
      avgResponseTimeMs: answerAgg._avg.responseTimeMs,
    };
  }
}
