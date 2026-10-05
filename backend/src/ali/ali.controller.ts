import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AliService } from './ali.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';
import { ExplainMistakeDto } from './dto/explain-mistake.dto';
import { VocabularyAlternativesDto } from './dto/vocabulary-alternatives.dto';
import { WritingFeedbackDto } from './dto/writing-feedback.dto';

/**
 * /api/v1/ali — GET me for the player's recent ALI messages, plus the
 * on-demand Learning Assistant / AI Tutor endpoints (spec §4.2): the
 * player explicitly asks ALI something rather than ALI reacting to an
 * authoritative progression event.
 */
@Controller('ali')
@UseGuards(JwtAuthGuard)
export class AliController {
  constructor(private readonly ali: AliService) {}

  @Get('me')
  getMyMessages(@CurrentUserId() userId: string, @Query('limit') limit?: string) {
    // Clamp to 1-50: a junk value used to give NaN (a 500) and a huge one the whole history.
    const parsed = Number.parseInt(limit ?? '', 10);
    const safe = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 50) : undefined;
    return this.ali.getMyMessages(userId, safe);
  }

  // Each of these three is a paid AI call: 10 a minute per player, plus a daily cap in AliService.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('explain-mistake')
  explainMistake(@CurrentUserId() userId: string, @Body() dto: ExplainMistakeDto) {
    return this.ali.explainMistake(userId, dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('vocabulary-alternatives')
  suggestVocabularyAlternatives(
    @CurrentUserId() userId: string,
    @Body() dto: VocabularyAlternativesDto,
  ) {
    return this.ali.suggestVocabularyAlternatives(userId, dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('writing-feedback')
  reviewWriting(@CurrentUserId() userId: string, @Body() dto: WritingFeedbackDto) {
    return this.ali.reviewWriting(userId, dto);
  }
}
