import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FriendsService, type FriendPublicView } from '../../friends/friends.service';
import { NotificationService } from '../../notifications/notification.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { ArcadeChallengeService } from '../challenge.service';
import { WORD_DUEL_CONFIG } from '../config/arcade.config';
import { isCompleteItSentenceUsable } from '../complete-it/complete-it.util';
import { WordDuelService, type WordDuelStateView } from './word-duel.service';

/** What the challenged friend sees before deciding. */
export interface WordDuelInviteView {
  matchId: string;
  /** OPEN = can still be accepted; ACCEPTED = already joined; CLOSED =
   * expired, cancelled, declined or taken. */
  status: 'OPEN' | 'ACCEPTED' | 'CLOSED';
  from: FriendPublicView | null;
  /** ISO time the challenge stops being joinable. */
  expiresAt: string;
}

/**
 * Friend challenges for Word Duel (2026-10 request). A duel is live, so a
 * challenge is a private WAITING match: the host sits on the waiting screen
 * for INVITE_TIMEOUT_SECONDS, the friend gets a notification, and accepting
 * starts the ordinary ACTIVE match. The random queue never sees it.
 * ScrambleQuest / Complete It / Hangman challenges are asynchronous and live
 * in ArcadeVersusService instead.
 */
@Injectable()
export class WordDuelInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: ArcadeChallengeService,
    private readonly friends: FriendsService,
    private readonly notifications: NotificationService,
    private readonly analytics: AnalyticsService,
    private readonly wordDuel: WordDuelService,
  ) {}

  async invite(userId: string, friendId: string): Promise<WordDuelStateView> {
    if (friendId === userId) throw new BadRequestException('You cannot challenge yourself.');
    await this.assertCanChallenge(userId, friendId);

    const mine = await this.prisma.wordDuelPlayerState.findFirst({
      where: { userId, match: { status: { in: ['WAITING', 'ACTIVE'] } } },
      include: { match: true },
    });
    if (mine) {
      if (mine.match.status === 'ACTIVE') {
        throw new ConflictException('Finish your current Word Duel first.');
      }
      const stale = this.isExpired(mine.match);
      if (mine.match.invitedUserId === friendId && !stale) {
        return this.wordDuel.getState(userId, mine.matchId); // same challenge, again
      }
      await this.prisma.wordDuelMatch.updateMany({
        where: { id: mine.matchId, status: 'WAITING' },
        data: { status: 'ABANDONED' },
      });
    }

    const picked = await this.challenges.pickChallenges(
      userId,
      WORD_DUEL_CONFIG.WORDS_PER_MATCH,
      [],
      WORD_DUEL_CONFIG.MIN_WORD_LENGTH,
      WORD_DUEL_CONFIG.MAX_WORD_LENGTH,
      (c) => isCompleteItSentenceUsable(c.word.exampleSentence, c.word.word),
    );
    if (picked.length === 0) {
      throw new BadRequestException('No words are available for Word Duel right now.');
    }
    const match = await this.prisma.wordDuelMatch.create({
      data: { wordIds: picked.map((c) => c.word.id), invitedUserId: friendId },
    });
    await this.prisma.wordDuelPlayerState.create({ data: { matchId: match.id, userId } });

    const me = await this.friends.getPublicIdentity(userId);
    this.notifications.notifyFireAndForget(
      friendId,
      'ARCADE_CHALLENGE',
      `${me?.username ?? 'A friend'} challenged you`,
      'Word Duel, live. Open the app within 2 minutes to accept.',
      {
        deepLink: `wordquest://arcade/word-duel/${match.id}`,
        data: { matchId: match.id, game: 'WORD_DUEL' },
      },
    );
    return this.wordDuel.getState(userId, match.id);
  }

  async getInvite(userId: string, matchId: string): Promise<WordDuelInviteView> {
    const match = await this.prisma.wordDuelMatch.findUnique({
      where: { id: matchId },
      include: { players: { select: { userId: true } } },
    });
    if (!match || match.invitedUserId !== userId) {
      throw new NotFoundException('Challenge not found');
    }
    const host = match.players.find((p) => p.userId !== userId);
    const from = host ? await this.friends.getPublicIdentity(host.userId) : null;
    const expiresAt = new Date(
      match.createdAt.getTime() + WORD_DUEL_CONFIG.INVITE_TIMEOUT_SECONDS * 1000,
    );
    const joined = match.players.some((p) => p.userId === userId);
    let status: WordDuelInviteView['status'] = 'CLOSED';
    if (joined) status = 'ACCEPTED';
    else if (match.status === 'WAITING' && !this.isExpired(match)) status = 'OPEN';
    return { matchId, status, from, expiresAt: expiresAt.toISOString() };
  }

  async accept(userId: string, matchId: string): Promise<WordDuelStateView> {
    const match = await this.prisma.wordDuelMatch.findUnique({
      where: { id: matchId },
      include: { players: { select: { userId: true } } },
    });
    if (!match || match.invitedUserId !== userId) {
      throw new NotFoundException('Challenge not found');
    }
    // Already in (a double-tap, or reopening the notification): just resume.
    if (match.players.some((p) => p.userId === userId)) {
      return this.wordDuel.getState(userId, matchId);
    }
    if (match.status !== 'WAITING' || this.isExpired(match)) {
      throw new ConflictException('This challenge is no longer open.');
    }
    const hostId = match.players[0]?.userId;
    if (!hostId || (await this.friends.areBlocked(userId, hostId))) {
      throw new ForbiddenException('This challenge is no longer open.');
    }

    const busy = await this.prisma.wordDuelPlayerState.findFirst({
      where: { userId, match: { status: { in: ['WAITING', 'ACTIVE'] } } },
      include: { match: { select: { status: true } } },
    });
    if (busy?.match.status === 'ACTIVE') {
      throw new ConflictException('Finish your current Word Duel first.');
    }
    if (busy) {
      await this.prisma.wordDuelMatch.updateMany({
        where: { id: busy.matchId, status: 'WAITING' },
        data: { status: 'ABANDONED' },
      });
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + WORD_DUEL_CONFIG.MATCH_DURATION_MINUTES * 60_000);
    const claimed = await this.prisma.wordDuelMatch.updateMany({
      where: { id: matchId, status: 'WAITING', invitedUserId: userId },
      data: { status: 'ACTIVE', startedAt: now, endsAt },
    });
    if (claimed.count === 0) throw new ConflictException('This challenge is no longer open.');

    await this.prisma.wordDuelPlayerState.create({ data: { matchId, userId } });
    for (const id of [userId, hostId]) {
      this.analytics.track(id, 'DUEL_STARTED', { matchId }, { screen: 'WordDuel' });
    }
    return this.wordDuel.getState(userId, matchId);
  }

  async decline(userId: string, matchId: string): Promise<{ declined: boolean }> {
    const match = await this.prisma.wordDuelMatch.findUnique({ where: { id: matchId } });
    if (!match || match.invitedUserId !== userId) {
      throw new NotFoundException('Challenge not found');
    }
    const closed = await this.prisma.wordDuelMatch.updateMany({
      where: { id: matchId, status: 'WAITING' },
      data: { status: 'ABANDONED' },
    });
    return { declined: closed.count > 0 };
  }

  private isExpired(match: { createdAt: Date }): boolean {
    return match.createdAt.getTime() < Date.now() - WORD_DUEL_CONFIG.INVITE_TIMEOUT_SECONDS * 1000;
  }

  private async assertCanChallenge(userId: string, friendId: string): Promise<void> {
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
    if (!friendship || (await this.friends.areBlocked(userId, friendId))) {
      throw new ForbiddenException('You can only challenge your friends.');
    }
    const friend = await this.prisma.user.findUnique({
      where: { id: friendId },
      select: { status: true },
    });
    if (!friend || friend.status === 'DELETED') {
      throw new NotFoundException('That player is not available.');
    }
  }
}
