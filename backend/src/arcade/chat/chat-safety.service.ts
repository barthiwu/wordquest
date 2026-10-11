import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { ChatFlagSeverity, ChatFlagSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CHAT_SAFETY_CONFIG } from '../config/arcade.config';

/** What a player's recent flags add up to. */
export interface ChatFlagTally {
  blocked24h: number;
  insults24h: number;
  reporters7d: number;
}

/**
 * How many minutes of chat pause a tally earns (0 = none). Pure so the policy
 * is easy to read and test: the longest applicable pause wins.
 */
export function chatMuteMinutes(tally: ChatFlagTally): number {
  const c = CHAT_SAFETY_CONFIG;
  const options = [0];
  if (tally.blocked24h >= c.BLOCKED_HARD_MUTE_AT) options.push(c.BLOCKED_HARD_MUTE_MINUTES);
  else if (tally.blocked24h >= c.BLOCKED_SOFT_MUTE_AT) options.push(c.BLOCKED_SOFT_MUTE_MINUTES);
  if (tally.insults24h >= c.INSULT_MUTE_AT) options.push(c.INSULT_MUTE_MINUTES);
  if (tally.reporters7d >= c.REPORTERS_MUTE_AT) options.push(c.REPORTERS_MUTE_MINUTES);
  return Math.max(...options);
}

export const CHAT_MUTED_MESSAGE =
  'Your chat is paused for a while because of language in earlier messages. You can still play.';

/**
 * The chat-behaviour ledger shared by every in-game chat: records refused
 * language, delivered insults and reports from other players as ChatFlag rows
 * (what moderators review), and turns a pattern of them into a timed chat
 * mute on the sender. Muting never blocks play, only chatting.
 */
@Injectable()
export class ChatSafetyService {
  private readonly logger = new Logger(ChatSafetyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Throws 403 while the player's chat is paused. */
  async assertCanChat(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { chatMutedUntil: true },
    });
    if (user?.chatMutedUntil && user.chatMutedUntil.getTime() > Date.now()) {
      throw new ForbiddenException(CHAT_MUTED_MESSAGE);
    }
  }

  /**
   * Records one flag and applies any mute it earns. Returns true when the
   * sender is now muted. Never throws: a failed ledger write must not turn a
   * chat send into a 500 (the message was already refused or delivered).
   */
  async record(input: {
    userId: string;
    source: ChatFlagSource;
    matchId: string;
    messageId?: string;
    reporterId?: string;
    severity: ChatFlagSeverity;
    body: string;
  }): Promise<boolean> {
    try {
      await this.prisma.chatFlag.create({
        data: {
          userId: input.userId,
          source: input.source,
          matchId: input.matchId,
          messageId: input.messageId,
          reporterId: input.reporterId,
          severity: input.severity,
          body: input.body.slice(0, CHAT_SAFETY_CONFIG.FLAG_BODY_MAX),
        },
      });
      return await this.applyMute(input.userId);
    } catch (err) {
      this.logger.error(`Could not record chat flag: ${(err as Error).message}`);
      return false;
    }
  }

  private async tally(userId: string): Promise<ChatFlagTally> {
    const day = new Date(Date.now() - 24 * 3_600_000);
    const week = new Date(Date.now() - CHAT_SAFETY_CONFIG.REPORT_WINDOW_DAYS * 86_400_000);
    const [blocked24h, insults24h, reporters] = await Promise.all([
      this.prisma.chatFlag.count({ where: { userId, severity: 'BLOCKED', createdAt: { gte: day } } }),
      this.prisma.chatFlag.count({ where: { userId, severity: 'INSULT', createdAt: { gte: day } } }),
      this.prisma.chatFlag.findMany({
        where: { userId, severity: 'REPORTED', createdAt: { gte: week }, reporterId: { not: null } },
        distinct: ['reporterId'],
        select: { reporterId: true },
      }),
    ]);
    return { blocked24h, insults24h, reporters7d: reporters.length };
  }

  private async applyMute(userId: string): Promise<boolean> {
    const minutes = chatMuteMinutes(await this.tally(userId));
    if (minutes <= 0) return false;
    const until = new Date(Date.now() + minutes * 60_000);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { chatMutedUntil: true },
    });
    if (!user?.chatMutedUntil || user.chatMutedUntil < until) {
      await this.prisma.user.update({ where: { id: userId }, data: { chatMutedUntil: until } });
      this.logger.warn(`Chat muted for ${minutes} min: user ${userId}`);
    }
    return true;
  }

  /** Messages in `messageIds` that `viewerId` has reported — hidden from that viewer from then on. */
  async reportedByViewer(
    viewerId: string,
    targetType: 'WORD_DUEL_MESSAGE' | 'ARCADE_VERSUS_MESSAGE',
    messageIds: string[],
  ): Promise<Set<string>> {
    if (messageIds.length === 0) return new Set();
    const rows = await this.prisma.report.findMany({
      where: { reporterId: viewerId, targetType, targetId: { in: messageIds } },
      select: { targetId: true },
    });
    return new Set(rows.map((r) => r.targetId));
  }

  /** Admin view: the most recent flags, newest first. */
  async listRecent(severity?: ChatFlagSeverity, limit = 200) {
    const rows = await this.prisma.chatFlag.findMany({
      where: severity ? { severity } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
      include: { user: { select: { displayName: true, chatMutedUntil: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      displayName: r.user.displayName,
      mutedUntil: r.user.chatMutedUntil,
      source: r.source,
      matchId: r.matchId,
      messageId: r.messageId,
      reporterId: r.reporterId,
      severity: r.severity,
      body: r.body,
      createdAt: r.createdAt,
    }));
  }
}
