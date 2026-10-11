import { HttpException, HttpStatus } from '@nestjs/common';

/** Rate/volume limits shared by every in-game chat. */
export interface ChatLimitConfig {
  MIN_INTERVAL_MS: number;
  QUICK_MIN_INTERVAL_MS: number;
  DUPLICATE_WINDOW_MS: number;
  MAX_MESSAGES_PER_PLAYER_PER_MATCH: number;
}

export interface LastMessage {
  body: string;
  kind: 'TEXT' | 'QUICK';
  createdAt: Date;
}

/**
 * Throws 429 when this sender is going too fast, repeating themselves, or
 * has used up their messages for the match. Quick chat has a shorter gap
 * (it is one tap) and may repeat; text may not be sent twice in a row.
 */
export function assertChatRateOk(
  cfg: ChatLimitConfig,
  next: { kind: 'TEXT' | 'QUICK'; body: string },
  last: LastMessage | undefined,
  totalSent: number,
  now: number = Date.now(),
): void {
  const gap = next.kind === 'QUICK' ? cfg.QUICK_MIN_INTERVAL_MS : cfg.MIN_INTERVAL_MS;
  if (last && now - last.createdAt.getTime() < gap) {
    throw new HttpException('Slow down a little.', HttpStatus.TOO_MANY_REQUESTS);
  }
  if (
    next.kind === 'TEXT' &&
    last &&
    last.kind === 'TEXT' &&
    last.body === next.body &&
    now - last.createdAt.getTime() < cfg.DUPLICATE_WINDOW_MS
  ) {
    throw new HttpException('You just sent that.', HttpStatus.TOO_MANY_REQUESTS);
  }
  if (totalSent >= cfg.MAX_MESSAGES_PER_PLAYER_PER_MATCH) {
    throw new HttpException(
      'You have reached the chat limit for this match.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
