import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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
    return this.ali.getMyMessages(userId, limit ? Number(limit) : undefined);
  }

  @Post('explain-mistake')
  explainMistake(@CurrentUserId() userId: string, @Body() dto: ExplainMistakeDto) {
    return this.ali.explainMistake(userId, dto);
  }

  @Post('vocabulary-alternatives')
  suggestVocabularyAlternatives(
    @CurrentUserId() userId: string,
    @Body() dto: VocabularyAlternativesDto,
  ) {
    return this.ali.suggestVocabularyAlternatives(userId, dto);
  }

  @Post('writing-feedback')
  reviewWriting(@CurrentUserId() userId: string, @Body() dto: WritingFeedbackDto) {
    return this.ali.reviewWriting(userId, dto);
  }
}
