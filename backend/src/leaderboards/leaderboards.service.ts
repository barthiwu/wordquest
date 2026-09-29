import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { continentForCountryCode, countryCodesForContinent } from '../common/country-continent';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  clanName: string | null;
  countryCode: string | null;
  level: number;
  totalXp: number;
  /** When this player was last active (UserProgression.lastActiveOn's raw
   * instant, same field the streak system writes to) — null if they've
   * never recorded activity. The mobile client uses this to show an
   * "active today" style indicator; it is not itself a "currently
   * online" signal, just the most recent activity timestamp we track. */
  lastActiveOn: Date | null;
}

export interface LeaderboardView {
  entries: LeaderboardEntry[];
  /** The requesting user's own rank/row, even when they fall outside `entries`. */
  viewer: LeaderboardEntry;
}

interface ProgressionRow {
  totalXp: number;
  level: number;
  lastActiveOn: Date | null;
  user: { id: string; username: string; clan: { name: string } | null; countryCode: string | null };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Leaderboards (build order §47 item 25, spec §30): Global, Clan,
 * Country, Continent, Friends, and Boss Battle.
 *
 * Postgres is the only source of truth here — §30 allows Redis for fast
 * ranking at scale, but that's a caching optimization on top of this
 * data, not a replacement for it, and there's no Redis in this
 * environment to build and verify against yet. Ranking a few thousand
 * rows by an indexed column is cheap enough that Postgres alone is the
 * right call until it measurably isn't.
 *
 * "Friends" (§30) went in once the Friends module (2026-09, Barth) gave
 * WordQuest an actual social graph to rank against — getFriends reads
 * FriendsService's underlying Friendship rows directly rather than
 * importing FriendsService itself, since "accepted friendship" is a
 * one-line Prisma query and doesn't need that module's full surface.
 * "Personal" is folded into `viewer` on every response rather than
 * being a separate endpoint, since "your rank" only means something in
 * the context of a specific leaderboard.
 *
 * "Boss Battle" (getBossBattle, 2026-09, Barth) ranks by lifetime Boss
 * Battle XP -- the sum of BossBattlePlayer.rewardXp across every battle
 * a player has finished, NOT UserProgression.totalXp (which blends
 * every XP source together). This is deliberately a different shape
 * from every other leaderboard here (a groupBy aggregate over
 * BossBattlePlayer, not a ProgressionRow), since Boss Battle is a group
 * event with its own XP pool rather than a per-player running total
 * WordQuest already tracks anywhere else.
 *
 * Global/Country/Continent were briefly dropped from the mobile UI
 * (Sept 2026, in favor of Clan/Friend/Boss Battle only) and restored
 * shortly after (2026-09, Barth: wants to follow how people are
 * progressing across Overall and Country specifically) -- the service
 * methods below were never removed, so this restore is UI-only on the
 * mobile side; see LeaderboardScreen.
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
        user: {
          select: { id: true, username: true, clan: { select: { name: true } }, countryCode: true },
        },
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
        user: {
          select: { id: true, username: true, clan: { select: { name: true } }, countryCode: true },
        },
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
   * Ranks the viewer only against players who share their exact country
   * (§30 tie-in with the flag/country picker added at onboarding —
   * Correction & Completion Spec follow-up). A player with no
   * countryCode set has nothing to be scoped to, same shape as `getClan`
   * for "not in a clan".
   */
  async getCountry(userId: string): Promise<LeaderboardView> {
    const viewer = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { countryCode: true },
    });

    if (!viewer.countryCode) {
      throw new BadRequestException('Set your country to see the country leaderboard.');
    }

    const rows = await this.prisma.userProgression.findMany({
      where: { user: { countryCode: viewer.countryCode } },
      orderBy: [{ totalXp: 'desc' }, { userId: 'asc' }],
      include: {
        user: {
          select: { id: true, username: true, clan: { select: { name: true } }, countryCode: true },
        },
      },
    });

    const entries = rows.map((row: ProgressionRow, index: number) => this.toEntry(row, index + 1));
    const viewerEntry = entries.find((e: LeaderboardEntry) => e.userId === userId);
    if (!viewerEntry) {
      throw new BadRequestException('Could not locate your entry on the country leaderboard.');
    }

    return { entries, viewer: viewerEntry };
  }

  /**
   * Ranks the viewer against every player whose country falls in the
   * same continent, per the code -> continent table in
   * common/country-continent.ts (kept manually in sync with the
   * mobile app's country list). Same "nothing to scope to yet" shape
   * as `getCountry` when the viewer has no countryCode set.
   */
  async getContinent(userId: string): Promise<LeaderboardView> {
    const viewer = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { countryCode: true },
    });

    const continent = continentForCountryCode(viewer.countryCode);
    if (!continent) {
      throw new BadRequestException('Set your country to see the continent leaderboard.');
    }

    const rows = await this.prisma.userProgression.findMany({
      where: { user: { countryCode: { in: countryCodesForContinent(continent) } } },
      orderBy: [{ totalXp: 'desc' }, { userId: 'asc' }],
      include: {
        user: {
          select: { id: true, username: true, clan: { select: { name: true } }, countryCode: true },
        },
      },
    });

    const entries = rows.map((row: ProgressionRow, index: number) => this.toEntry(row, index + 1));
    const viewerEntry = entries.find((e: LeaderboardEntry) => e.userId === userId);
    if (!viewerEntry) {
      throw new BadRequestException('Could not locate your entry on the continent leaderboard.');
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
        user: {
          select: { id: true, username: true, clan: { select: { name: true } }, countryCode: true },
        },
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

  /**
   * Ranks the viewer together with their accepted friends only (2026-09,
   * Barth) -- always includes the viewer even if they have zero friends
   * yet (rank 1 of 1), unlike getClan's "not in a clan" error, since
   * having no friends yet is a perfectly normal state, not a
   * precondition failure.
   */
  async getFriends(userId: string): Promise<LeaderboardView> {
    const friendships = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true },
    });
    const friendIds = friendships.map((f: { requesterId: string; addresseeId: string }) =>
      f.requesterId === userId ? f.addresseeId : f.requesterId,
    );
    const memberIds = [userId, ...friendIds];

    const rows = await this.prisma.userProgression.findMany({
      where: { userId: { in: memberIds } },
      orderBy: [{ totalXp: 'desc' }, { userId: 'asc' }],
      include: {
        user: {
          select: { id: true, username: true, clan: { select: { name: true } }, countryCode: true },
        },
      },
    });

    const entries = rows.map((row: ProgressionRow, index: number) => this.toEntry(row, index + 1));
    const viewerEntry = entries.find((e: LeaderboardEntry) => e.userId === userId);
    if (!viewerEntry) {
      // Should be unreachable -- the viewer is always in memberIds -- but
      // fail loudly rather than fabricate a viewer entry, same defensive
      // stance getClan takes.
      throw new BadRequestException('Could not locate your entry on the friend leaderboard.');
    }

    return { entries, viewer: viewerEntry };
  }

  /**
   * Ranks players by lifetime Boss Battle XP (sum of
   * BossBattlePlayer.rewardXp across every battle they've finished) --
   * see the class doc comment for why this is a different data shape
   * from every other leaderboard here. `level` is meaningless for this
   * view (Boss Battle XP isn't account level) and is always 0.
   */
  async getBossBattle(userId: string, limit: number = DEFAULT_LIMIT): Promise<LeaderboardView> {
    const clampedLimit = this.clampLimit(limit);

    const grouped = await this.prisma.bossBattlePlayer.groupBy({
      by: ['userId'],
      _sum: { rewardXp: true },
      orderBy: { _sum: { rewardXp: 'desc' } },
      take: clampedLimit,
    });

    const users = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((g: { userId: string }) => g.userId) } },
      select: {
        id: true,
        username: true,
        clan: { select: { name: true } },
        countryCode: true,
        progression: { select: { lastActiveOn: true } },
      },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const entries: LeaderboardEntry[] = grouped.map(
      (g: { userId: string; _sum: { rewardXp: number | null } }, index: number) => {
        const user = userById.get(g.userId);
        return {
          rank: index + 1,
          userId: g.userId,
          username: user?.username ?? 'Unknown',
          clanName: user?.clan?.name ?? null,
          countryCode: user?.countryCode ?? null,
          level: 0,
          totalXp: g._sum.rewardXp ?? 0,
          lastActiveOn: user?.progression?.lastActiveOn ?? null,
        };
      },
    );

    const viewer = await this.getBossBattleViewerEntry(userId);
    return { entries, viewer };
  }

  private async getBossBattleViewerEntry(userId: string): Promise<LeaderboardEntry> {
    const [viewerSum, user] = await Promise.all([
      this.prisma.bossBattlePlayer.aggregate({ where: { userId }, _sum: { rewardXp: true } }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          username: true,
          clan: { select: { name: true } },
          countryCode: true,
          progression: { select: { lastActiveOn: true } },
        },
      }),
    ]);
    const totalBossXp = viewerSum._sum.rewardXp ?? 0;

    // 1 + how many OTHER players' summed rewardXp exceeds the viewer's --
    // the same "count who's ahead" shape getRankForXp uses for the
    // global leaderboard, just over a groupBy aggregate instead of a
    // plain column.
    const ahead = await this.prisma.bossBattlePlayer.groupBy({
      by: ['userId'],
      _sum: { rewardXp: true },
      having: { rewardXp: { _sum: { gt: totalBossXp } } },
    });

    return {
      rank: ahead.length + 1,
      userId,
      username: user.username,
      clanName: user.clan?.name ?? null,
      countryCode: user.countryCode,
      level: 0,
      totalXp: totalBossXp,
      lastActiveOn: user.progression?.lastActiveOn ?? null,
    };
  }

  private toEntry(row: ProgressionRow, rank: number): LeaderboardEntry {
    return {
      rank,
      userId: row.user.id,
      username: row.user.username,
      clanName: row.user.clan?.name ?? null,
      countryCode: row.user.countryCode,
      level: row.level,
      totalXp: row.totalXp,
      lastActiveOn: row.lastActiveOn,
    };
  }

  private clampLimit(limit: number): number {
    if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
    return Math.min(Math.trunc(limit), MAX_LIMIT);
  }
}
