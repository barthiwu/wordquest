import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ArcadeGame, ArcadeVersusKind, ArcadeVersusStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FriendsService, FriendPublicView } from '../../friends/friends.service';
import { NotificationService } from '../../notifications/notification.service';
import { ProgressionService } from '../../progression/progression.service';
import { ArcadePlayLimitService } from '../limits/play-limit.service';
import { ARCADE_VERSUS_CONFIG, ARCADE_VERSUS_GAMES } from '../config/arcade.config';
import { decideResult, isReadyToSettle, VersusSide } from './versus.util';

type VersusGame = (typeof ARCADE_VERSUS_GAMES)[number];
type MatchRow = Prisma.ArcadeVersusMatchGetPayload<Record<string, never>>;
type SessionRow = Prisma.ArcadeGameSessionGetPayload<Record<string, never>>;

/** One player's live progress, as shown to either player. */
export interface VersusProgressView {
  /** Words answered so far. */
  answered: number;
  finished: boolean;
}

/** The final result from the viewer's own point of view. */
export interface VersusResultView {
  outcome: 'WIN' | 'LOSS' | 'DRAW' | 'NO_CONTEST';
  /** WIN/DRAW = played out; FORFEIT = someone left or ran out of time. */
  reason: 'WIN' | 'DRAW' | 'FORFEIT' | 'NO_CONTEST';
  myCorrect: number;
  theirCorrect: number;
  myTimeMs: number;
  theirTimeMs: number;
  /** XP win bonus this player received (random matches only). */
  bonusXp: number;
}

export interface VersusMatchView {
  id: string;
  game: ArcadeGame;
  kind: ArcadeVersusKind;
  status: ArcadeVersusStatus;
  /** True when the viewer is the one who was challenged. */
  incoming: boolean;
  opponent: FriendPublicView | null;
  /** Queue / invite expiry while waiting; the play deadline once active. */
  expiresAt: string;
  wordsTotal: number | null;
  me: VersusProgressView;
  opponentProgress: VersusProgressView;
  /** Set once settled. */
  result: VersusResultView | null;
}

export interface VersusMineView {
  incoming: VersusMatchView[];
  outgoing: VersusMatchView[];
  active: VersusMatchView[];
  recent: VersusMatchView[];
}

const GAME_LABEL: Record<VersusGame, string> = {
  SCRAMBLE_QUEST: 'ScrambleQuest',
  COMPLETE_IT: 'Complete It',
  HANGMAN: 'Hangman',
};

const EMPTY_SIDE: VersusSide = {
  correct: 0,
  answered: 0,
  timeMs: 0,
  finished: false,
  finishedAt: null,
};

/**
 * Head-to-head matches for ScrambleQuest, Complete It and Hangman. A match
 * only adds pairing, a shared word list and a result on top of the games'
 * ordinary single-player sessions -- each player's session, timer, hints and
 * XP are exactly the solo ones. See schema.prisma's ArcadeVersusMatch.
 */
@Injectable()
export class ArcadeVersusService {
  private readonly logger = new Logger(ArcadeVersusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
    private readonly notifications: NotificationService,
    private readonly progression: ProgressionService,
    private readonly playLimit: ArcadePlayLimitService,
  ) {}

  /**
   * A player with no plays left cannot start a new search, but may still
   * resume one (or a match) they already have open -- that play was counted
   * when it started.
   */
  private async assertMayEnterQueue(userId: string, game: VersusGame): Promise<void> {
    if (!(await this.playLimit.isLocked(userId, game))) return;
    const open = await this.prisma.arcadeVersusMatch.findFirst({
      where: {
        game,
        kind: 'RANDOM',
        status: { in: ['SEARCHING', 'ACTIVE'] },
        expiresAt: { gt: new Date() },
        OR: [{ hostId: userId }, { guestId: userId }],
      },
      select: { id: true },
    });
    if (!open) await this.playLimit.assertCanPlay(userId, game);
  }

  // ── Random queue ──────────────────────────────────────────────────────

  /**
   * Joins the random queue for `game`: pairs with a waiting player if there
   * is one, otherwise waits (the client polls getMatch until it is paired or
   * expires). Idempotent -- a player already searching or playing this game
   * gets that match back. One search at a time: queueing for another game
   * cancels the first.
   */
  async queue(userId: string, game: VersusGame): Promise<VersusMatchView> {
    this.assertGame(game);
    await this.assertMayEnterQueue(userId, game);
    const matchId = await this.prisma.$transaction(async (tx) => {
      // Serialized per game: of two players queueing at the same instant,
      // the second always finds the first's row and pairs with it.
      await this.lockQueue(tx, game);
      const now = new Date();

      const mine = await tx.arcadeVersusMatch.findMany({
        where: {
          game,
          kind: 'RANDOM',
          status: { in: ['SEARCHING', 'ACTIVE'] },
          expiresAt: { gt: now },
          OR: [{ hostId: userId }, { guestId: userId }],
        },
        include: {
          sessions: { where: { userId }, select: { status: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      // Resume a search, or a match this player has not finished yet. A
      // match they already finished (still waiting on the opponent) does
      // not block a fresh one.
      const resumable = mine.find(
        (m) => m.status === 'SEARCHING' || !m.sessions.some((s) => s.status === 'COMPLETED'),
      );
      if (resumable) return resumable.id;

      // One search at a time: a search for another game is dropped.
      await tx.arcadeVersusMatch.updateMany({
        where: { hostId: userId, kind: 'RANDOM', status: 'SEARCHING' },
        data: { status: 'CANCELLED', settledAt: now },
      });
      return this.pairOrEnqueue(tx, userId, game);
    });
    return this.getMatch(userId, matchId);
  }

  private async pairOrEnqueue(
    tx: Prisma.TransactionClient,
    userId: string,
    game: VersusGame,
  ): Promise<string> {
    const now = new Date();
    const candidates = await tx.arcadeVersusMatch.findMany({
      where: {
        game,
        kind: 'RANDOM',
        status: 'SEARCHING',
        expiresAt: { gt: now },
        hostId: { not: userId },
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
    for (const candidate of candidates) {
      if (await this.friends.areBlocked(userId, candidate.hostId)) continue;
      const host = await tx.user.findUnique({
        where: { id: candidate.hostId },
        select: { status: true },
      });
      if (!host || host.status === 'DELETED') continue;

      const windowMs = ARCADE_VERSUS_CONFIG.RANDOM_PLAY_WINDOW_MINUTES * 60_000;
      await tx.arcadeVersusMatch.update({
        where: { id: candidate.id },
        data: {
          guestId: userId,
          status: 'ACTIVE',
          activatedAt: now,
          expiresAt: new Date(now.getTime() + windowMs),
        },
      });
      return candidate.id;
    }
    const created = await tx.arcadeVersusMatch.create({
      data: {
        game,
        kind: 'RANDOM',
        status: 'SEARCHING',
        hostId: userId,
        expiresAt: new Date(now.getTime() + ARCADE_VERSUS_CONFIG.QUEUE_TIMEOUT_SECONDS * 1000),
      },
    });
    return created.id;
  }

  /** Serializes pairing per game so two players queueing at the same
   * instant always meet instead of both waiting. */
  private async lockQueue(tx: Prisma.TransactionClient, game: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`arcade-versus:${game}`}))`;
  }

  // ── Friend challenges ─────────────────────────────────────────────────

  async invite(userId: string, friendId: string, game: VersusGame): Promise<VersusMatchView> {
    this.assertGame(game);
    if (friendId === userId) throw new BadRequestException('You cannot challenge yourself.');
    await this.playLimit.assertCanPlay(userId, game);

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: userId, addresseeId: friendId },
          { requesterId: friendId, addresseeId: userId },
        ],
      },
      select: { id: true },
    });
    if (!friendship) throw new ForbiddenException('You can only challenge your friends.');
    if (await this.friends.areBlocked(userId, friendId)) {
      throw new ForbiddenException('You can only challenge your friends.');
    }
    const friend = await this.prisma.user.findUnique({
      where: { id: friendId },
      select: { status: true },
    });
    if (!friend || friend.status === 'DELETED') {
      throw new NotFoundException('That player is not available.');
    }

    const now = new Date();
    // The same challenge, in either direction, is returned rather than
    // duplicated.
    const existing = await this.prisma.arcadeVersusMatch.findFirst({
      where: {
        game,
        kind: 'FRIEND',
        status: { in: ['INVITED', 'ACTIVE'] },
        expiresAt: { gt: now },
        OR: [
          { hostId: userId, guestId: friendId },
          { hostId: friendId, guestId: userId },
        ],
      },
    });
    if (existing) return this.getMatch(userId, existing.id);

    const open = await this.prisma.arcadeVersusMatch.count({
      where: { hostId: userId, kind: 'FRIEND', status: 'INVITED', expiresAt: { gt: now } },
    });
    if (open >= ARCADE_VERSUS_CONFIG.MAX_OPEN_INVITES) {
      throw new BadRequestException(
        'You have too many open challenges. Wait for a reply or cancel one first.',
      );
    }

    const match = await this.prisma.arcadeVersusMatch.create({
      data: {
        game,
        kind: 'FRIEND',
        status: 'INVITED',
        hostId: userId,
        guestId: friendId,
        expiresAt: new Date(now.getTime() + ARCADE_VERSUS_CONFIG.INVITE_TTL_HOURS * 3_600_000),
      },
    });

    const me = await this.friends.getPublicIdentity(userId);
    this.notifications.notifyFireAndForget(
      friendId,
      'ARCADE_CHALLENGE',
      `${me?.username ?? 'A friend'} challenged you`,
      `${GAME_LABEL[game]}, head to head. Accept to play.`,
      { deepLink: `wordquest://arcade/versus/${match.id}`, data: { matchId: match.id, game } },
    );
    return this.getMatch(userId, match.id);
  }

  async respond(userId: string, matchId: string, accept: boolean): Promise<VersusMatchView> {
    const match = await this.loadParticipantMatch(userId, matchId);
    if (match.kind !== 'FRIEND' || match.guestId !== userId) {
      throw new ForbiddenException('Only the challenged player can answer a challenge.');
    }
    const now = new Date();
    if (match.status !== 'INVITED' || match.expiresAt <= now) {
      throw new ConflictException('This challenge is no longer open.');
    }
    if (await this.friends.areBlocked(userId, match.hostId)) {
      throw new ForbiddenException('This challenge is no longer open.');
    }
    // Declining is always allowed; accepting needs a play left today.
    if (accept) await this.playLimit.assertCanPlay(userId, match.game);
    const windowMs = ARCADE_VERSUS_CONFIG.FRIEND_PLAY_WINDOW_HOURS * 3_600_000;
    const claimed = await this.prisma.arcadeVersusMatch.updateMany({
      where: { id: matchId, status: 'INVITED' },
      data: accept
        ? {
            status: 'ACTIVE',
            activatedAt: now,
            expiresAt: new Date(now.getTime() + windowMs),
          }
        : { status: 'DECLINED', settledAt: now },
    });
    if (claimed.count === 0) throw new ConflictException('This challenge is no longer open.');

    if (accept) {
      const me = await this.friends.getPublicIdentity(userId);
      this.notifications.notifyFireAndForget(
        match.hostId,
        'ARCADE_CHALLENGE',
        `${me?.username ?? 'Your friend'} accepted`,
        `Your ${GAME_LABEL[match.game as VersusGame]} challenge is on. Go play!`,
        { deepLink: `wordquest://arcade/versus/${match.id}`, data: { matchId: match.id } },
      );
    }
    return this.getMatch(userId, matchId);
  }

  /** The host backing out of a search or of an unanswered challenge. */
  async cancel(userId: string, matchId: string): Promise<VersusMatchView> {
    const match = await this.loadParticipantMatch(userId, matchId);
    if (match.hostId !== userId) {
      throw new ForbiddenException('Only the player who started this can cancel it.');
    }
    await this.prisma.arcadeVersusMatch.updateMany({
      where: { id: matchId, status: { in: ['SEARCHING', 'INVITED'] } },
      data: { status: 'CANCELLED', settledAt: new Date() },
    });
    return this.getMatch(userId, matchId);
  }

  // ── Reading ───────────────────────────────────────────────────────────

  async getMatch(userId: string, matchId: string): Promise<VersusMatchView> {
    let match = await this.loadParticipantMatch(userId, matchId);
    match = await this.refresh(match);
    return this.buildView(match, userId);
  }

  async listMine(userId: string): Promise<VersusMineView> {
    const now = new Date();
    const rows = await this.prisma.arcadeVersusMatch.findMany({
      where: {
        AND: [
          { OR: [{ hostId: userId }, { guestId: userId }] },
          {
            OR: [
              { status: 'INVITED', expiresAt: { gt: now } },
              { status: 'ACTIVE' }, // past its deadline still needs settling
              { status: 'COMPLETED' },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    const out: VersusMineView = { incoming: [], outgoing: [], active: [], recent: [] };
    for (const raw of rows) {
      const row = await this.refresh(raw);
      if (row.status === 'INVITED') {
        const view = await this.buildView(row, userId);
        (view.incoming ? out.incoming : out.outgoing).push(view);
      } else if (row.status === 'ACTIVE') {
        out.active.push(await this.buildView(row, userId));
      } else if (
        row.status === 'COMPLETED' &&
        out.recent.length < ARCADE_VERSUS_CONFIG.RECENT_RESULTS_SHOWN
      ) {
        out.recent.push(await this.buildView(row, userId));
      }
    }
    return out;
  }

  // ── Used by the games ─────────────────────────────────────────────────

  /**
   * Called by ScrambleQuest/Complete It/Hangman `start` when a player opens
   * their half of a match. Checks the player may play it and returns either
   * their already-started session (a relaunch) or the shared word list to
   * create one from. The first player to start picks the words (via the
   * game's own `pick`, so each game's length and quality rules apply); the
   * second reads the same list.
   */
  async resolveStart(
    userId: string,
    matchId: string,
    game: VersusGame,
    pick: () => Promise<string[]>,
  ): Promise<{ existing: SessionRow | null; wordIds: string[]; matchId: string }> {
    let match = await this.loadParticipantMatch(userId, matchId);
    match = await this.refresh(match);
    if (match.game !== game) throw new BadRequestException('This match is for a different game.');
    if (match.status !== 'ACTIVE') {
      throw new ConflictException('This match is not open for play.');
    }

    const existing = await this.prisma.arcadeGameSession.findUnique({
      where: { versusMatchId_userId: { versusMatchId: matchId, userId } },
    });
    if (existing) {
      if (existing.status !== 'ACTIVE') {
        throw new ConflictException('You have already played your half of this match.');
      }
      return { existing, wordIds: match.wordIds, matchId };
    }

    if (!match.wordsPickedAt) {
      const picked = await pick();
      if (picked.length === 0) {
        throw new BadRequestException('No words are available right now.');
      }
      await this.prisma.arcadeVersusMatch.updateMany({
        where: { id: matchId, wordsPickedAt: null },
        data: { wordIds: picked, wordsPickedAt: new Date() },
      });
      match = await this.prisma.arcadeVersusMatch.findUniqueOrThrow({ where: { id: matchId } });
    }
    return { existing: null, wordIds: match.wordIds, matchId };
  }

  // ── Settling ──────────────────────────────────────────────────────────

  /** Settles / expires a match if its time has come, returning the fresh row. */
  private async refresh(match: MatchRow): Promise<MatchRow> {
    const now = new Date();
    if (match.status === 'SEARCHING') {
      if (match.expiresAt <= now) {
        await this.prisma.arcadeVersusMatch.updateMany({
          where: { id: match.id, status: 'SEARCHING' },
          data: { status: 'EXPIRED', settledAt: now },
        });
      }
    } else if (match.status === 'INVITED' && match.expiresAt <= now) {
      await this.prisma.arcadeVersusMatch.updateMany({
        where: { id: match.id, status: 'INVITED' },
        data: { status: 'EXPIRED', settledAt: now },
      });
    } else if (match.status === 'ACTIVE') {
      await this.settleIfDue(match);
    }
    return this.prisma.arcadeVersusMatch.findUniqueOrThrow({ where: { id: match.id } });
  }

  private graceMs(kind: ArcadeVersusKind): number {
    return kind === 'FRIEND'
      ? ARCADE_VERSUS_CONFIG.FRIEND_FINISH_GRACE_HOURS * 3_600_000
      : ARCADE_VERSUS_CONFIG.RANDOM_FINISH_GRACE_MINUTES * 60_000;
  }

  private async sidesFor(
    match: MatchRow,
  ): Promise<{ host: VersusSide; guest: VersusSide; wordsTotal: number | null }> {
    const sessions = await this.prisma.arcadeGameSession.findMany({
      where: { versusMatchId: match.id },
      include: { answers: { select: { isCorrect: true, responseTimeMs: true } } },
    });
    const sideOf = (userId: string | null): VersusSide => {
      const s = sessions.find((x) => x.userId === userId);
      if (!s) return { ...EMPTY_SIDE };
      return {
        correct: s.answers.filter((a) => a.isCorrect).length,
        answered: s.answers.length,
        timeMs: s.answers.reduce((sum, a) => sum + (a.responseTimeMs ?? 0), 0),
        finished: s.status === 'COMPLETED',
        finishedAt: s.status === 'COMPLETED' ? s.endedAt : null,
      };
    };
    return {
      host: sideOf(match.hostId),
      guest: sideOf(match.guestId),
      wordsTotal: match.wordsPickedAt ? match.wordIds.length : null,
    };
  }

  async settleIfDue(match: MatchRow, now: Date = new Date()): Promise<boolean> {
    if (match.status !== 'ACTIVE' || !match.guestId) return false;
    const { host, guest } = await this.sidesFor(match);
    if (!isReadyToSettle(match.expiresAt, host, guest, this.graceMs(match.kind), now)) {
      return false;
    }
    const decision = decideResult(host, guest);
    const winnerId =
      decision.winner === 'HOST'
        ? match.hostId
        : decision.winner === 'GUEST'
          ? match.guestId
          : null;

    // Exactly one caller wins this compare-and-swap and runs the side effects.
    const claimed = await this.prisma.arcadeVersusMatch.updateMany({
      where: { id: match.id, status: 'ACTIVE' },
      data: {
        status: decision.reason === 'NO_CONTEST' ? 'EXPIRED' : 'COMPLETED',
        winnerId,
        resultReason: decision.reason,
        hostCorrect: host.correct,
        guestCorrect: guest.correct,
        hostTimeMs: host.timeMs,
        guestTimeMs: guest.timeMs,
        settledAt: now,
      },
    });
    if (claimed.count === 0) return false;

    if (winnerId && match.kind === 'RANDOM' && ARCADE_VERSUS_CONFIG.WIN_BONUS_XP > 0) {
      await this.progression
        .awardXp(
          winnerId,
          ARCADE_VERSUS_CONFIG.WIN_BONUS_XP,
          `${GAME_LABEL[match.game as VersusGame]} head-to-head win`,
          'ARCADE_VERSUS',
          match.id,
        )
        .catch((err) => this.logger.warn(`versus win bonus failed for ${match.id}: ${err}`));
    }

    // Friend matches play out over hours, so tell both players. Random
    // matches are played live; only tell the player who was not there to
    // see it (a forfeit).
    const gameName = GAME_LABEL[match.game as VersusGame];
    const link = { deepLink: `wordquest://arcade/versus/${match.id}`, data: { matchId: match.id } };
    const forfeit = decision.reason === 'FORFEIT';
    for (const [uid, side] of [
      [match.hostId, host],
      [match.guestId, guest],
    ] as const) {
      if (decision.reason === 'NO_CONTEST') continue;
      if (match.kind === 'RANDOM' && !(forfeit && !side.finished)) continue;
      const body =
        decision.winner === null
          ? `${gameName}: it finished level.`
          : winnerId === uid
            ? `${gameName}: you won!`
            : `${gameName}: your opponent won this one.`;
      this.notifications.notifyFireAndForget(uid, 'ARCADE_RESULT', 'Match result', body, link);
    }
    return true;
  }

  /** Housekeeping: expire waiting matches and settle ones that ran out of
   * time even if nobody is polling them. */
  @Cron('*/5 * * * *')
  async sweep(): Promise<void> {
    try {
      const now = new Date();
      await this.prisma.arcadeVersusMatch.updateMany({
        where: { status: { in: ['SEARCHING', 'INVITED'] }, expiresAt: { lte: now } },
        data: { status: 'EXPIRED', settledAt: now },
      });
      const due = await this.prisma.arcadeVersusMatch.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { activatedAt: 'asc' },
        take: 200,
      });
      for (const match of due) {
        await this.settleIfDue(match, now);
      }
    } catch (err) {
      this.logger.warn(`Versus sweep failed: ${err}`);
    }
  }

  // ── Views ─────────────────────────────────────────────────────────────

  private async buildView(match: MatchRow, viewerId: string): Promise<VersusMatchView> {
    const iAmHost = match.hostId === viewerId;
    const opponentId = iAmHost ? match.guestId : match.hostId;
    const opponent = opponentId ? await this.friends.getPublicIdentity(opponentId) : null;
    const { host, guest, wordsTotal } = await this.sidesFor(match);
    const mine = iAmHost ? host : guest;
    const theirs = iAmHost ? guest : host;

    let result: VersusResultView | null = null;
    if (match.settledAt && match.resultReason && ['COMPLETED', 'EXPIRED'].includes(match.status)) {
      const reason = match.resultReason as VersusResultView['reason'];
      const outcome: VersusResultView['outcome'] =
        reason === 'NO_CONTEST'
          ? 'NO_CONTEST'
          : match.winnerId === null
            ? 'DRAW'
            : match.winnerId === viewerId
              ? 'WIN'
              : 'LOSS';
      result = {
        outcome,
        reason,
        myCorrect: (iAmHost ? match.hostCorrect : match.guestCorrect) ?? 0,
        theirCorrect: (iAmHost ? match.guestCorrect : match.hostCorrect) ?? 0,
        myTimeMs: (iAmHost ? match.hostTimeMs : match.guestTimeMs) ?? 0,
        theirTimeMs: (iAmHost ? match.guestTimeMs : match.hostTimeMs) ?? 0,
        bonusXp:
          outcome === 'WIN' && match.kind === 'RANDOM' ? ARCADE_VERSUS_CONFIG.WIN_BONUS_XP : 0,
      };
    }

    return {
      id: match.id,
      game: match.game,
      kind: match.kind,
      status: match.status,
      incoming: match.kind === 'FRIEND' && match.guestId === viewerId && match.status === 'INVITED',
      opponent,
      expiresAt: match.expiresAt.toISOString(),
      wordsTotal,
      me: { answered: mine.answered, finished: mine.finished },
      opponentProgress: { answered: theirs.answered, finished: theirs.finished },
      result,
    };
  }

  private async loadParticipantMatch(userId: string, matchId: string): Promise<MatchRow> {
    const match = await this.prisma.arcadeVersusMatch.findUnique({ where: { id: matchId } });
    if (!match || (match.hostId !== userId && match.guestId !== userId)) {
      throw new NotFoundException('Match not found');
    }
    return match;
  }

  private assertGame(game: string): asserts game is VersusGame {
    if (!(ARCADE_VERSUS_GAMES as readonly string[]).includes(game)) {
      throw new BadRequestException('That game has no head-to-head mode.');
    }
  }
}
