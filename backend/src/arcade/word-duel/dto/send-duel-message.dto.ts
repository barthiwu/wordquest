import { IsString, MaxLength } from 'class-validator';

export class SendDuelMessageDto {
  // Content rules (length, links, language) live in duel-chat-filter.ts so
  // the player gets a specific reason; this only guards against huge payloads.
  @IsString()
  @MaxLength(1000)
  body!: string;
}
