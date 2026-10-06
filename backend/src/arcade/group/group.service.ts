import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ArcadeGame, ArcadeGroupStatus, Prisma } from '@prisma/client';
import { isUniqueConstraintError } from '../../common/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import { ARCADE_GROUP_CONFIG, ARCADE_GROUP_GAMES } from '../config/arcade.config';
import { CreateGroupDto } from './dto/group.dto';
import {
  generateGroupCode,
  GroupSide,
  GroupWordStat,
  normalizeGroupCode,
  rankGroup,
  wordStats,
} from './group.util';

type GroupGame = (typeof ARCADE_GROUP_GAMES)[number];
type GroupRow = Prisma.ArcadeGroupGetPayload<Record<string, never>>;
type SessionRow = Prisma.ArcadeGameSessionGetPayload<Record<string, never>>;

/** One member as shown in the group. Scores are null when the viewer may not see them. */
export interface GroupMemberView {
  userId: string;
  username: string;
  avatarUrl: string | null;
  isHost: boolean;
  isMe: boolean;
  state: 'NOT_STARTED' | 'PLAYING' | 'FINISHED';
  rank: number | null;
  correct: number | null;
  answered: number | null;
  timeMs: number | null;
}

export interface GroupWordStatView extends GroupWordStat {
  word: string;
  definition: string;
}

export interface GroupView {
  id: string;
  /** The secret in the invite link. Only members are ever sent it. */
  code: string;
  game: ArcadeGame;
  status: ArcadeGroupStatus;
  title: string | null;
  isHost: boolean;
  maxMembers: number;
  memberCount: number;
  showLeaderboard: boolean;
  windowMinutes: number;
  /** Null until the first member opens the round. */
  wordsTotal: number | null;
  /** Lobby: when the unused group lapses. Active: the end of the round. */
  expiresAt: string;
  activatedAt: string | null;
  endedAt: string | null;
  me: GroupMemberView | null;
  members: GroupMemberView[];
  /** Host only, and only once the round has ended. */
  wordBreakdown: GroupWordStatView[] | null;
}

/** What a person with the link sees before joining. */
export interface GroupPreviewView {
  code: string;
  game: ArcadeGame;
  title: string | null;
  hostUsername: string;
  status: ArcadeGroupStatus;
  memberCount: number;
  maxMembers: number;
  full: boolean;
}

export interface GroupSummaryView {
  id: string;
  code: string | null;
  game: ArcadeGame;
  status: ArcadeGroupStatus;
  title: string | null;
  isHost: boolean;
  memberCount: number;
  createdAt: string;
  endedAt: string | null;
}

const NOT_FOUND = 'Group not found';

/**
 * Group Play: up to ARCADE_GROUP_CONFIG.MAX_MEMBERS people play the same
 * ScrambleQuest / Complete It / Hangman words in one timed round, set up by
 * one host who shares a private link. Each member's session, timer, hints
 * and XP are the games' ordinary solo ones -- the group adds membership, a
 * shared word list and a results table. See schema.prisma's ArcadeGroup.
 */
@Injectable()
export class ArcadeGroupService {
  private readonly logger = new Logger(ArcadeGroupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  // ── Creating, joining, leaving ────────────────────────────────────────

  async create(userId: string, dto: CreateGroupDto): Promise<GroupView> {
    this.assertGame(dto.game);
    const open = await this.prisma.arcadeGroup.count({
      where: { hostId: userId, status: { in: ['LOBBY', 'ACTIVE'] } },
    });
    if (open >= ARCADE_GROUP_CONFIG.MAX_OPEN_GROUPS_PER_HOST) {
      throw new ConflictException(
        'You have too many open groups. End one before creating another.',
      );
    }
    const title = dto.title?.trim() || null;
    const expiresAt = new Date(Date.now() + ARCADE_GROUP_CONFIG.LOBBY_TTL_HOURS * 3_600_000);

    // A collision on the random code is astronomically unlikely, but the
    // unique index makes a retry the correct answer rather than a 500.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const group = await this.prisma.arcadeGroup.create({
          data: {
            code: generateGroupCode(ARCADE_GROUP_CONFIG.CODE_LENGTH),
            game: dto.game,
            title,
            hostId: userId,
            maxMembers: ARCADE_GROUP_CONFIG.MAX_MEMBERS,
            showLeaderboard: dto.showLeaderboard ?? true,
            windowMinutes: ARCADE_GROUP_CONFIG.DEFAULT_WINDOW_MINUTES,
            expiresAt,
            members: { create: { userId } },
          },
        });
        return this.buildView(group, userId);
      } catch (err) {
        if (!isUniqueConstraintError(err)) throw err;
      }
    }
    throw new ConflictException('Could not create the group. Please try again.');
  }

  /** What the link shows before someone joins. Reveals no member names. */
  async preview(rawCode: string): Promise<GroupPreviewView> {
    const group = await this.findByCode(rawCode);
    const fresh = await this.refresh(group);
    if (fresh.status === 'ENDED') throw new NotFoundException(NOT_FOUND);
    const host = await this.prisma.user.findUnique({
      where: { id: fresh.hostId },
      select: { username: true },
    });
    const memberCount = await this.prisma.arcadeGroupMember.count({ where: { groupId: fresh.id } });
    return {
      code: fresh.code,
      game: fresh.game,
      title: fresh.title,
      hostUsername: host?.username ?? '',
      status: fresh.status,
      memberCount,
      maxMembers: fresh.maxMembers,
      full: memberCount >= fresh.maxMembers,
    };
  }

  /** Idempotent: joining a group you are already in just returns it. */
  async join(userId: string, rawCode: string): Promise<GroupView> {
    const found = await this.findByCode(rawCode);
    const group = await this.refresh(found);
    if (group.status === 'ENDED') throw new NotFoundException(NOT_FOUND);

    await this.prisma.$transaction(async (tx) => {
      // Serialized per group so the member cap holds when many join at once.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`arcade-group:${group.id}`}))`;
      const already = await tx.arcadeGroupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId } },
        select: { id: true },
      });
      if (already) return;
      const count = await tx.arcadeGroupMember.count({ where: { groupId: group.id } });
      if (count >= group.maxMembers) {
        throw new ConflictException(`This group is full (${group.maxMembers} players).`);
      }
      await tx.arcadeGroupMember.create({ data: { groupId: group.id, userId } });
    });
    return this.buildView(group, userId);
  }

  /** A member leaves (not the host: the host ends the group instead). */
  async leave(userId: string, groupId: string): Promise<void> {
    const group = await this.loadMemberGroup(userId, groupId);
    if (group.hostId === userId) {
      throw new BadRequestException('The host cannot leave. End the group instead.');
    }
    await this.removeMembership(group.id, userId);
  }

  /** The host removes someone from the group. */
  async removeMember(hostId: string, groupId: string, targetId: string): Promise<GroupView> {
    const group = await this.loadHostGroup(hostId, groupId);
    if (targetId === hostId) {
      throw new BadRequestException('The host cannot be removed. End the group instead.');
    }
    await this.removeMembership(group.id, targetId);
    return this.buildView(group, hostId);
  }

  private async removeMembership(groupId: string, userId: string): Promise<void> {
    await this.prisma.$transaction([
      // Whatever they had open stops; their played answers no longer appear in the table.
      this.prisma.arcadeGameSession.updateMany({
        where: { groupId, userId, status: 'ACTIVE' },
        data: { status: 'ABANDONED', endedAt: new Date() },
      }),
      this.prisma.arcadeGroupMember.deleteMany({ where: { groupId, userId } }),
    ]);
  }

  // ── The host runs the round ───────────────────────────────────────────

  async start(hostId: string, groupId: string, windowMinutes?: number): Promise<GroupView> {
    const group = await this.loadHostGroup(hostId, groupId);
    if (group.status !== 'LOBBY') {
      throw new ConflictException(
        group.status === 'ACTIVE' ? 'The round has already started.' : 'This group has ended.',
      );
    }
    const minutes = windowMinutes ?? group.windowMinutes;
    const now = new Date();
    const claimed = await this.prisma.arcadeGroup.updateMany({
      where: { id: group.id, status: 'LOBBY' },
      data: {
        status: 'ACTIVE',
        windowMinutes: minutes,
        activatedAt: now,
        expiresAt: new Date(now.getTime() + minutes * 60_000),
      },
    });
    if (claimed.count === 0) throw new ConflictException('The round has already started.');
    return this.getView(hostId, group.id);
  }

  async end(hostId: string, groupId: string): Promise<GroupView> {
    const group = await this.loadHostGroup(hostId, groupId);
    await this.endGroup(group.id);
    return this.getView(hostId, group.id);
  }

  // ── Reading ───────────────────────────────────────────────────────────

  /** One group; also the polling endpoint. Members only. */
  async get(userId: string, groupId: string): Promise<GroupView> {
    return this.getView(userId, groupId);
  }

  /** The groups this player is in: open ones, and ones that ended in the last week. */
  async listMine(userId: string): Promise<GroupSummaryView[]> {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const memberships = await this.prisma.arcadeGroupMember.findMany({
      where: {
        userId,
        group: { OR: [{ status: { in: ['LOBBY', 'ACTIVE'] } }, { endedAt: { gte: since } }] },
      },
      include: { group: { include: { _count: { select: { members: true } } } } },
      orderBy: { joinedAt: 'desc' },
      take: 30,
    });
    return memberships.map(({ group }) => ({
      id: group.id,
      code: group.code,
      game: group.game,
      status: group.status,
      title: group.title,
      isHost: group.hostId === userId,
      memberCount: group._count.members,
      createdAt: group.createdAt.toISOString(),
      endedAt: group.endedAt?.toISOString() ?? null,
    }));
  }

  // ── Used by the games ─────────────────────────────────────────────────

  /**
   * Called by ScrambleQuest/Complete It/Hangman `start` when a member opens
   * their play. Checks they may play it and returns either their already-
   * started session (a relaunch) or the shared word list to create one from.
   * The first member to start picks the words (via the game's own `pick`, so
   * each game's length and quality rules apply); everyone else reads the
   * same list.
   */
  async resolveStart(
    userId: string,
    groupId: string,
    game: GroupGame,
    pick: () => Promise<string[]>,
  ): Promise<{ existing: SessionRow | null; wordIds: string[]; groupId: string }> {
    let group = await this.loadMemberGroup(userId, groupId);
    group = await this.refresh(group);
    if (group.game !== game) throw new BadRequestException('This group is for a different game.');
    if (group.status === 'LOBBY') {
      throw new ConflictException('The host has not started the round yet.');
    }
    if (group.status !== 'ACTIVE') throw new ConflictException('This group has ended.');

    const existing = await this.prisma.arcadeGameSession.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (existing) {
      if (existing.status !== 'ACTIVE') {
        throw new ConflictException('You have already played this round.');
      }
      return { existing, wordIds: group.wordIds, groupId };
    }

    if (!group.wordsPickedAt) {
      const picked = await pick();
      if (picked.length === 0) throw new BadRequestException('No words are available right now.');
      await this.prisma.arcadeGroup.updateMany({
        where: { id: groupId, wordsPickedAt: null },
        data: { wordIds: picked, wordsPickedAt: new Date() },
      });
      group = await this.prisma.arcadeGroup.findUniqueOrThrow({ where: { id: groupId } });
    }
    return { existing: null, wordIds: group.wordIds, groupId };
  }

  // ── Ending ────────────────────────────────────────────────────────────

  /** Ends a group once and stops any play still open in it. Idempotent. */
  private async endGroup(groupId: string): Promise<void> {
    const now = new Date();
    const claimed = await this.prisma.arcadeGroup.updateMany({
      where: { id: groupId, status: { in: ['LOBBY', 'ACTIVE'] } },
      data: { status: 'ENDED', endedAt: now },
    });
    if (claimed.count === 0) return;
    // A play left running when the round closes stops here; its answers so
    // far still count in the results.
    await this.prisma.arcadeGameSession.updateMany({
      where: { groupId, status: 'ACTIVE' },
      data: { status: 'ABANDONED', endedAt: now },
    });
  }

  /** Ends the group if its time has come, returning the fresh row. */
  private async refresh(group: GroupRow): Promise<GroupRow> {
    if (group.status !== 'ENDED' && group.expiresAt.getTime() <= Date.now()) {
      await this.endGroup(group.id);
      return this.prisma.arcadeGroup.findUniqueOrThrow({ where: { id: group.id } });
    }
    return group;
  }

  /** Housekeeping: end groups whose time ran out even if nobody is looking, and drop old results. */
  @Cron('* * * * *')
  async sweep(): Promise<void> {
    try {
      const now = new Date();
      const due = await this.prisma.arcadeGroup.findMany({
        where: { status: { in: ['LOBBY', 'ACTIVE'] }, expiresAt: { lte: now } },
        select: { id: true },
        take: 200,
      });
      for (const g of due) await this.endGroup(g.id);
    } catch (err) {
      this.logger.warn(`Group sweep failed: ${err}`);
    }
  }

  @Cron('17 3 * * *')
  async purgeOld(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - ARCADE_GROUP_CONFIG.ENDED_RETENTION_DAYS * 86_400_000);
      await this.prisma.arcadeGroup.deleteMany({
        where: { status: 'ENDED', endedAt: { lt: cutoff } },
      });
    } catch (err) {
      this.logger.warn(`Group purge failed: ${err}`);
    }
  }

  // ── Views ─────────────────────────────────────────────────────────────

  private async getView(userId: string, groupId: string): Promise<GroupView> {
    const group = await this.refresh(await this.loadMemberGroup(userId, groupId));
    return this.buildView(group, userId);
  }

  private async buildView(group: GroupRow, viewerId: string): Promise<GroupView> {
    const isHost = group.hostId === viewerId;
    const [members, sessions] = await Promise.all([
      this.prisma.arcadeGroupMember.findMany({
        where: { groupId: group.id },
        include: { user: { select: { id: true, username: true, avatarKey: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.arcadeGameSession.findMany({
        where: { groupId: group.id },
        include: {
          answers: { select: { wordIndex: true, isCorrect: true, responseTimeMs: true } },
        },
      }),
    ]);

    const memberIds = new Set(members.map((m) => m.userId));
    const sessionByUser = new Map(sessions.map((s) => [s.userId, s]));
    const sides: GroupSide[] = members.map((m) => {
      const s = sessionByUser.get(m.userId);
      if (!s) return { userId: m.userId, state: 'NOT_STARTED', correct: 0, answered: 0, timeMs: 0 };
      return {
        userId: m.userId,
        state: s.status === 'COMPLETED' ? 'FINISHED' : 'PLAYING',
        correct: s.answers.filter((a) => a.isCorrect).length,
        answered: s.answers.length,
        timeMs: s.answers.reduce((sum, a) => sum + (a.responseTimeMs ?? 0), 0),
      };
    });
    // Idle members are listed by when they joined, which is the order they came in above.
    const ranked = rankGroup(sides);
    const byUser = new Map(members.map((m) => [m.userId, m]));

    // A member sees everyone's scores unless the host turned the leaderboard
    // off for this group; the host always sees all of them.
    const seesAll = isHost || group.showLeaderboard;
    const toView = (side: (typeof ranked)[number]): GroupMemberView => {
      const m = byUser.get(side.userId);
      const visible = seesAll || side.userId === viewerId;
      return {
        userId: side.userId,
        username: m?.user.username ?? '',
        avatarUrl: null,
        isHost: side.userId === group.hostId,
        isMe: side.userId === viewerId,
        state: side.state,
        rank: visible ? side.rank : null,
        correct: visible ? side.correct : null,
        answered: visible ? side.answered : null,
        timeMs: visible ? side.timeMs : null,
      };
    };
    const views = ranked.map(toView);
    const avatars = await Promise.all(
      views.map((v) => this.users.resolveAvatarUrl(byUser.get(v.userId)?.user.avatarKey ?? null)),
    );
    views.forEach((v, i) => {
      v.avatarUrl = avatars[i];
    });

    let wordBreakdown: GroupWordStatView[] | null = null;
    if (isHost && group.status === 'ENDED' && group.wordsPickedAt) {
      const stats = wordStats(
        group.wordIds,
        sessions
          .filter((s) => memberIds.has(s.userId))
          .flatMap((s) =>
            s.answers.map((a) => ({ wordIndex: a.wordIndex, isCorrect: a.isCorrect })),
          ),
      );
      const words = await this.prisma.word.findMany({
        where: { id: { in: group.wordIds } },
        select: { id: true, word: true, definition: true },
      });
      const wordById = new Map(words.map((w) => [w.id, w]));
      wordBreakdown = stats.map((s) => ({
        ...s,
        word: wordById.get(s.wordId)?.word ?? '',
        definition: wordById.get(s.wordId)?.definition ?? '',
      }));
    }

    return {
      id: group.id,
      code: group.code,
      game: group.game,
      status: group.status,
      title: group.title,
      isHost,
      maxMembers: group.maxMembers,
      memberCount: members.length,
      showLeaderboard: group.showLeaderboard,
      windowMinutes: group.windowMinutes,
      wordsTotal: group.wordsPickedAt ? group.wordIds.length : null,
      expiresAt: group.expiresAt.toISOString(),
      activatedAt: group.activatedAt?.toISOString() ?? null,
      endedAt: group.endedAt?.toISOString() ?? null,
      me: views.find((v) => v.isMe) ?? null,
      members: views,
      wordBreakdown,
    };
  }

  // ── Lookups ───────────────────────────────────────────────────────────

  private async findByCode(rawCode: string): Promise<GroupRow> {
    const code = normalizeGroupCode(rawCode, ARCADE_GROUP_CONFIG.CODE_LENGTH);
    const group = code ? await this.prisma.arcadeGroup.findUnique({ where: { code } }) : null;
    if (!group) throw new NotFoundException(NOT_FOUND);
    return group;
  }

  /** The group, for a member only: anyone else gets the same "not found" as a missing id. */
  private async loadMemberGroup(userId: string, groupId: string): Promise<GroupRow> {
    const group = await this.prisma.arcadeGroup.findFirst({
      where: { id: groupId, members: { some: { userId } } },
    });
    if (!group) throw new NotFoundException(NOT_FOUND);
    return group;
  }

  private async loadHostGroup(hostId: string, groupId: string): Promise<GroupRow> {
    const group = await this.loadMemberGroup(hostId, groupId);
    if (group.hostId !== hostId) throw new ForbiddenException('Only the host can do that.');
    return this.refresh(group);
  }

  private assertGame(game: string): asserts game is GroupGame {
    if (!(ARCADE_GROUP_GAMES as readonly string[]).includes(game)) {
      throw new BadRequestException('That game has no group mode.');
    }
  }
}
