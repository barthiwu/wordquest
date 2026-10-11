import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { FriendsService } from '../../friends/friends.service';
import { WORD_DUEL_CHAT_CONFIG } from '../config/arcade.config';
import { CHAT_REJECTION_MESSAGES, checkChatMessage, hasInsult } from './duel-chat-filter';
import { CHAT_MUTED_MESSAGE, ChatSafetyService } from '../chat/chat-safety.service';
import { isQuickChatCode } from '../chat/quick-chat';
import { assertChatRateOk } from '../chat/chat-limits';

/** One chat message as a player sees it. */
export interface WordDuelChatMessageView {
  id: string;
  /** Global polling cursor: ask for messages after the highest seq you have. */
  seq: number;
  senderId: string;
  /** True when the viewer wrote it. */
  mine: boolean;
  /** TEXT: `body` is the message. QUICK: `body` is a quick-chat code. */
  kind: 'TEXT' | 'QUICK';
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
    private readonly safety: ChatSafetyService,
  ) {}

  async send(
    userId: string,
    matchId: string,
    input: { body?: string; quick?: string },
  ): Promise<WordDuelChatMessageView> {
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
    await this.safety.assertCanChat(userId);

    let kind: 'TEXT' | 'QUICK';
    let body: string;
    if (input.quick !== undefined) {
      if (!isQuickChatCode(input.quick)) throw new BadRequestException('Unknown quick chat.');
      kind = 'QUICK';
      body = input.quick;
    } else {
      const checked = checkChatMessage(input.body ?? '');
      if (!checked.ok) {
        if (checked.reason === 'LANGUAGE') {
          // Refused, never delivered — but recorded, and a pattern earns a chat pause.
          const muted = await this.safety.record({
            userId,
            source: 'WORD_DUEL',
            matchId,
            severity: 'BLOCKED',
            body: input.body ?? '',
          });
          if (muted) throw new ForbiddenException(CHAT_MUTED_MESSAGE);
        }
        throw new BadRequestException(CHAT_REJECTION_MESSAGES[checked.reason]);
      }
      kind = 'TEXT';
      body = checked.body;
    }

    const mine = await this.prisma.wordDuelMessage.findMany({
      where: { matchId, senderId: userId },
      orderBy: { seq: 'desc' },
      take: 1,
      select: { body: true, kind: true, createdAt: true },
    });
    const total = await this.prisma.wordDuelMessage.count({ where: { matchId, senderId: userId } });
    assertChatRateOk(WORD_DUEL_CHAT_CONFIG, { kind, body }, mine[0], total);

    const created = await this.prisma.wordDuelMessage.create({
      data: { matchId, senderId: userId, body, kind },
    });
    if (kind === 'TEXT' && hasInsult(body)) {
      // Delivered (heated duels happen) but on the record, and reportable.
      await this.safety.record({
        userId,
        source: 'WORD_DUEL',
        matchId,
        messageId: created.id,
        severity: 'INSULT',
        body,
      });
    }
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
    // A message the viewer reported is gone from their screen for good.
    const reported = await this.safety.reportedByViewer(
      userId,
      'WORD_DUEL_MESSAGE',
      rows.filter((r) => r.senderId !== userId).map((r) => r.id),
    );
    return rows.filter((row) => !reported.has(row.id)).map((row) => this.toView(row, userId));
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
    row: {
      id: string;
      seq: number;
      senderId: string;
      kind: 'TEXT' | 'QUICK';
      body: string;
      createdAt: Date;
    },
    viewerId: string,
  ): WordDuelChatMessageView {
    return {
      id: row.id,
      seq: row.seq,
      senderId: row.senderId,
      mine: row.senderId === viewerId,
      kind: row.kind,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
