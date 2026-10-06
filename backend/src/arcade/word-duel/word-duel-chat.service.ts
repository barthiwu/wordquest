import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { FriendsService } from '../../friends/friends.service';
import { WORD_DUEL_CHAT_CONFIG } from '../config/arcade.config';
import { CHAT_REJECTION_MESSAGES, checkChatMessage } from './duel-chat-filter';

/** One chat message as a player sees it. */
export interface WordDuelChatMessageView {
  id: string;
  /** Global polling cursor: ask for messages after the highest seq you have. */
  seq: number;
  senderId: string;
  /** True when the viewer wrote it. */
  mine: boolean;
  body: string;
  createdAt: string;
}

/**
 * Word Duel in-game chat. Only the two players of a match can read or write
 * it; it is open while the match is active and for a few minutes after, so
 * "gg" still lands. Everything a player might abuse is capped here (length,
 * speed, volume, repeats, links and language), and every message can be
 * reported or hidden by moderation.
 */
@Injectable()
export class WordDuelChatService {
  private readonly logger = new Logger(WordDuelChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
  ) {}

  async send(userId: string, matchId: string, rawBody: string): Promise<WordDuelChatMessageView> {
    const { match, opponentId } = await this.loadMatchForPlayer(userId, matchId);

    if (match.status === 'WAITING' || match.status === 'ABANDONED' || !opponentId) {
      throw new BadRequestException('Chat opens once your opponent has joined.');
    }
    if (match.status === 'COMPLETED' && !this.withinPostMatchGrace(match.completedAt)) {
      throw new BadRequestException('This match has ended.');
    }
    if (await this.friends.areBlocked(userId, opponentId)) {
      throw new ForbiddenException('Chat is not available with this player.');
    }

    const checked = checkChatMessage(rawBody);
    if (!checked.ok) throw new BadRequestException(CHAT_REJECTION_MESSAGES[checked.reason]);

    const mine = await this.prisma.wordDuelMessage.findMany({
      where: { matchId, senderId: userId },
      orderBy: { seq: 'desc' },
      take: 1,
      select: { body: true, createdAt: true },
    });
    const last = mine[0];
    const now = Date.now();
    if (last && now - last.createdAt.getTime() < WORD_DUEL_CHAT_CONFIG.MIN_INTERVAL_MS) {
      throw new HttpException('Slow down a little.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (
      last &&
      last.body === checked.body &&
      now - last.createdAt.getTime() < WORD_DUEL_CHAT_CONFIG.DUPLICATE_WINDOW_MS
    ) {
      throw new HttpException('You just sent that.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const total = await this.prisma.wordDuelMessage.count({ where: { matchId, senderId: userId } });
    if (total >= WORD_DUEL_CHAT_CONFIG.MAX_MESSAGES_PER_PLAYER_PER_MATCH) {
      throw new HttpException(
        'You have reached the chat limit for this match.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const created = await this.prisma.wordDuelMessage.create({
      data: { matchId, senderId: userId, body: checked.body },
    });
    return this.toView(created, userId);
  }

  /** Messages after `afterSeq` that this player may see. Empty (never an
   * error) when the match has no opponent yet or the pair is blocked. */
  async listForViewer(
    userId: string,
    matchId: string,
    afterSeq: number,
  ): Promise<WordDuelChatMessageView[]> {
    const { match, opponentId } = await this.loadMatchForPlayer(userId, matchId);
    if (match.status === 'WAITING' || !opponentId) return [];
    if (await this.friends.areBlocked(userId, opponentId)) return [];

    const rows = await this.prisma.wordDuelMessage.findMany({
      where: { matchId, hidden: false, seq: { gt: Math.max(0, afterSeq) } },
      orderBy: { seq: 'asc' },
      take: WORD_DUEL_CHAT_CONFIG.FETCH_LIMIT,
    });
    return rows.map((row) => this.toView(row, userId));
  }

  /** Daily purge of old messages. Anything a player reported is kept for
   * the moderation team. */
  @Cron('20 3 * * *')
  async cleanupOldMessages(): Promise<void> {
    const cutoff = new Date(Date.now() - WORD_DUEL_CHAT_CONFIG.RETENTION_DAYS * 86_400_000);
    try {
      const reported = await this.prisma.report.findMany({
        where: { targetType: 'WORD_DUEL_MESSAGE' },
        select: { targetId: true },
      });
      const keep = reported.map((r) => r.targetId);
      const result = await this.prisma.wordDuelMessage.deleteMany({
        where: { createdAt: { lt: cutoff }, ...(keep.length > 0 ? { id: { notIn: keep } } : {}) },
      });
      if (result.count > 0) this.logger.log(`Deleted ${result.count} old Word Duel chat messages`);
    } catch (err) {
      this.logger.error(`Word Duel chat cleanup failed: ${(err as Error).message}`);
    }
  }

  private withinPostMatchGrace(completedAt: Date | null): boolean {
    if (!completedAt) return true;
    return (
      Date.now() - completedAt.getTime() <= WORD_DUEL_CHAT_CONFIG.POST_MATCH_GRACE_MINUTES * 60_000
    );
  }

  private async loadMatchForPlayer(userId: string, matchId: string) {
    const match = await this.prisma.wordDuelMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        status: true,
        completedAt: true,
        players: { select: { userId: true } },
      },
    });
    const isPlayer = match?.players.some((p) => p.userId === userId) ?? false;
    // One message for "no such match" and "not your match": never confirm a
    // match id exists to someone who is not in it.
    if (!match || !isPlayer) throw new NotFoundException('Word Duel match not found');
    const opponentId = match.players.find((p) => p.userId !== userId)?.userId ?? null;
    return { match, opponentId };
  }

  private toView(
    row: { id: string; seq: number; senderId: string; body: string; createdAt: Date },
    viewerId: string,
  ): WordDuelChatMessageView {
    return {
      id: row.id,
      seq: row.seq,
      senderId: row.senderId,
      mine: row.senderId === viewerId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
