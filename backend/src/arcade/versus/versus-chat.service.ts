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
import { ARCADE_VERSUS_CHAT_CONFIG } from '../config/arcade.config';
import {
  CHAT_REJECTION_MESSAGES,
  checkChatMessage,
  hasInsult,
} from '../word-duel/duel-chat-filter';
import { CHAT_MUTED_MESSAGE, ChatSafetyService } from '../chat/chat-safety.service';
import { isQuickChatCode } from '../chat/quick-chat';
import { assertChatRateOk } from '../chat/chat-limits';

export interface VersusChatMessageView {
  id: string;
  /** Global polling cursor: ask for messages after the highest seq you have. */
  seq: number;
  senderId: string;
  mine: boolean;
  /** TEXT: `body` is the message. QUICK: `body` is a quick-chat code. */
  kind: 'TEXT' | 'QUICK';
  body: string;
  createdAt: string;
}

export interface VersusChatList {
  messages: VersusChatMessageView[];
  /** What this player may send in this match right now. */
  canType: boolean;
  canQuick: boolean;
}

/**
 * Chat inside a head-to-head challenge. Only the two players can read or
 * write it. Between friends it is full chat (typed + quick emoji); in a random
 * match against a stranger it is quick emoji only. It is open while the match
 * is live and for a while after it settles, and every cap (length, speed,
 * volume, links, language, blocks) is enforced here, server-side.
 */
@Injectable()
export class ArcadeVersusChatService {
  private readonly logger = new Logger(ArcadeVersusChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
    private readonly safety: ChatSafetyService,
  ) {}

  async send(
    userId: string,
    matchId: string,
    input: { body?: string; quick?: string },
  ): Promise<VersusChatMessageView> {
    const { match, opponentId } = await this.loadMatchForPlayer(userId, matchId);
    if (!opponentId || !this.isOpen(match)) {
      throw new BadRequestException('Chat is not open for this match.');
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
      if (match.kind !== 'FRIEND') {
        throw new ForbiddenException('Typed chat is only for friends. Use quick chat.');
      }
      const checked = checkChatMessage(input.body ?? '');
      if (!checked.ok) {
        if (checked.reason === 'LANGUAGE') {
          const muted = await this.safety.record({
            userId,
            source: 'ARCADE_VERSUS',
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

    const last = await this.prisma.arcadeVersusMessage.findMany({
      where: { matchId, senderId: userId },
      orderBy: { seq: 'desc' },
      take: 1,
      select: { body: true, kind: true, createdAt: true },
    });
    const total = await this.prisma.arcadeVersusMessage.count({
      where: { matchId, senderId: userId },
    });
    assertChatRateOk(ARCADE_VERSUS_CHAT_CONFIG, { kind, body }, last[0], total);

    const created = await this.prisma.arcadeVersusMessage.create({
      data: { matchId, senderId: userId, body, kind },
    });
    if (kind === 'TEXT' && hasInsult(body)) {
      await this.safety.record({
        userId,
        source: 'ARCADE_VERSUS',
        matchId,
        messageId: created.id,
        severity: 'INSULT',
        body,
      });
    }
    return this.toView(created, userId);
  }

  /** Messages after `afterSeq`. Empty (never an error) when chat is closed or the pair is blocked. */
  async listForViewer(userId: string, matchId: string, afterSeq: number): Promise<VersusChatList> {
    const { match, opponentId } = await this.loadMatchForPlayer(userId, matchId);
    const open = !!opponentId && this.isOpen(match);
    const blocked = !!opponentId && (await this.friends.areBlocked(userId, opponentId));
    let messages: VersusChatMessageView[] = [];
    if (opponentId && !blocked) {
      const rows = await this.prisma.arcadeVersusMessage.findMany({
        where: { matchId, hidden: false, seq: { gt: Math.max(0, afterSeq) } },
        orderBy: { seq: 'asc' },
        take: ARCADE_VERSUS_CHAT_CONFIG.FETCH_LIMIT,
      });
      // A message the viewer reported is gone from their screen for good.
      const reported = await this.safety.reportedByViewer(
        userId,
        'ARCADE_VERSUS_MESSAGE',
        rows.filter((r) => r.senderId !== userId).map((r) => r.id),
      );
      messages = rows.filter((row) => !reported.has(row.id)).map((row) => this.toView(row, userId));
    }
    return {
      messages,
      canQuick: open && !blocked,
      canType: open && !blocked && match.kind === 'FRIEND',
    };
  }

  @Cron('40 3 * * *')
  async cleanupOldMessages(): Promise<void> {
    const cutoff = new Date(Date.now() - ARCADE_VERSUS_CHAT_CONFIG.RETENTION_DAYS * 86_400_000);
    try {
      const reported = await this.prisma.report.findMany({
        where: { targetType: 'ARCADE_VERSUS_MESSAGE' },
        select: { targetId: true },
      });
      const keep = reported.map((r) => r.targetId);
      const result = await this.prisma.arcadeVersusMessage.deleteMany({
        where: { createdAt: { lt: cutoff }, ...(keep.length > 0 ? { id: { notIn: keep } } : {}) },
      });
      if (result.count > 0) this.logger.log(`Deleted ${result.count} old challenge chat messages`);
    } catch (err) {
      this.logger.error(`Challenge chat cleanup failed: ${(err as Error).message}`);
    }
  }

  private isOpen(match: { status: string; kind: string; settledAt: Date | null }): boolean {
    if (match.status === 'ACTIVE') return true;
    if (match.status !== 'COMPLETED') return false;
    if (!match.settledAt) return true;
    const graceMin =
      match.kind === 'FRIEND'
        ? ARCADE_VERSUS_CHAT_CONFIG.FRIEND_POST_MATCH_GRACE_MINUTES
        : ARCADE_VERSUS_CHAT_CONFIG.RANDOM_POST_MATCH_GRACE_MINUTES;
    return Date.now() - match.settledAt.getTime() <= graceMin * 60_000;
  }

  private async loadMatchForPlayer(userId: string, matchId: string) {
    const match = await this.prisma.arcadeVersusMatch.findUnique({
      where: { id: matchId },
      select: { id: true, kind: true, status: true, settledAt: true, hostId: true, guestId: true },
    });
    // One message for "no such match" and "not your match".
    if (!match || (match.hostId !== userId && match.guestId !== userId)) {
      throw new NotFoundException('Match not found');
    }
    const opponentId = match.hostId === userId ? match.guestId : match.hostId;
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
  ): VersusChatMessageView {
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
