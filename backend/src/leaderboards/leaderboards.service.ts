import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  clanName: string | null;
  level: number;
  totalXp: number;
}

export interface LeaderboardView {
  entries: LeaderboardEntry[];
  /** The requesting user's own rank/row, even when they fall outside `entries`. */
  viewer: LeaderboardEntry;
}

interface ProgressionRow {
  totalXp: number;
  level: number;
  user: { id: string; displayName: string; clan: { name: string } | null };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Leaderboards (build order §47 item 25, spec §30): Global and Clan today.
 *
 * Postgres is the only source of truth here — §30 allows Redis for fast
 * ranking at scale, but that's a caching optimization on top of this
 * data, not a replacement for it, and there's no Redis in this
 * environment to build and verify against yet. Ranking a few thousand
 * rows by an indexed column is cheap enough that Postgres alone is the
 * right call until it measurably isn't.
 *
 * "Friends" (§30) is NOT implemented — WordQuest has no social/friends
 * graph yet, so there's nothing authoritative to rank. Faking one from
 * clan-mates or global neighbors would misrepresent a feature that
 * doesn't exist. "Personal" is folded into `viewer` on every response
 * rather than being a separate endpoint, since "your rank" only means
 * something in the context of a specific leaderboard.
 */
@Injectable()
export class LeaderboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async getGlobal(userId: string, limit: number = DEFAULT_LIMIT): Promise<LeaderboardView> {
    const clampedLimit = this.clampLimit(limit);

    const rows = await this.prisma.userProgression.findMany({
      orderBy: [{ totalXp: 'desc' }, { userId: 'asc' }],
      take: clampedLimit,
      include: {
        user: { select: { id: true, displayName: true, clan: { select: { name: true } } } },
      },
    });

    const entries = rows.map((row: ProgressionRow, index: number) => this.toEntry(row, index + 1));
    const viewer = await this.getViewerEntry(userId);

    return { entries, viewer };
  }

  async getClan(userId: string): Promise<LeaderboardView> {
    const viewer = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { clanId: true },
    });

    if (!viewer.clanId) {
      throw new BadRequestException('Join a clan to see the clan leaderboard.');
    }

    const rows = await this.prisma.userProgression.findMany({
      where: { user: { clanId: viewer.clanId } },
      orderBy: [{ totalXp: 'desc' }, { userId: 'asc' }],
      include: {
        user: { select: { id: true, displayName: true, clan: { select: { name: true } } } },
      },
    });

    const entries = rows.map((row: ProgressionRow, index: number) => this.toEntry(row, index + 1));
    const viewerEntry = entries.find((e: LeaderboardEntry) => e.userId === userId);
    if (!viewerEntry) {
      // Should be unreachable — the viewer is necessarily a member of
      // their own clan's row set — but fail loudly rather than return
      // a LeaderboardView with a fabricated viewer entry if it ever is.
      throw new BadRequestException('Could not locate your entry on the clan leaderboard.');
    }

    return { entries, viewer: viewerEntry };
  }

  /**
   * The viewer's global rank, computed without pulling the whole table:
   * 1 + how many players have strictly more XP. Ties share a rank,
   * consistent with standard competition ranking — this intentionally
   * does not break ties by a secondary key the way `entries` ordering
   * does, since "your exact position among identical scores" isn't a
   * distinction a player benefits from seeing differently each refresh.
   */
  private async getViewerEntry(userId: string): Promise<LeaderboardEntry> {
    const progression = await this.prisma.userProgression.findUniqueOrThrow({
      where: { userId },
      include: {
        user: { select: { id: true, displayName: true, clan: { select: { name: true } } } },
      },
    });

    const rank = await this.getRankForXp(progression.totalXp);
    return this.toEntry(progression, rank);
  }

  /**
   * Just the rank number for a given XP total — the same single
   * count-query the full leaderboard view uses to place `viewer`
   * (Correction & Completion Spec §6: leaderboard notifications), but
   * without the wasted user/clan join or the top-50 `entries` pull that
   * `getGlobal` also does. Meant for a scheduler looping over many
   * players a tick at a time, where that extra work would be pure waste
   * repeated once per player.
   */
  async getRankForXp(totalXp: number): Promise<number> {
    const aheadCount = await this.prisma.userProgression.count({
      where: { totalXp: { gt: totalXp } },
    });
    return aheadCount + 1;
  }

  private toEntry(row: ProgressionRow, rank: number): LeaderboardEntry {
    return {
      rank,
      userId: row.user.id,
      displayName: row.user.displayName,
      clanName: row.user.clan?.name ?? null,
      level: row.level,
      totalXp: row.totalXp,
    };
  }

  private clampLimit(limit: number): number {
    if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
    return Math.min(Math.trunc(limit), MAX_LIMIT);
  }
}
