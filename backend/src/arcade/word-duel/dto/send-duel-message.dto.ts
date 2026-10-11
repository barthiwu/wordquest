import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { QUICK_CHAT_CODES } from '../../chat/quick-chat';

/** Exactly one of `body` (typed text) or `quick` (a quick-chat code). */
export class SendDuelMessageDto {
  // Content rules (length, links, language) live in duel-chat-filter.ts so
  // the player gets a specific reason; this only guards against huge payloads.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  body?: string;

  @IsOptional()
  @IsIn(QUICK_CHAT_CODES as unknown as string[])
  quick?: string;
}
