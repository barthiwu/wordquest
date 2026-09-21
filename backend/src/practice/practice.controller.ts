import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PracticeService } from './practice.service';
import { SubmitPracticeGuessDto } from './dto/submit-practice-guess.dto';
import { SubmitPracticeSentenceDto } from './dto/submit-practice-sentence.dto';
import { SubmitPracticeParagraphDto } from './dto/submit-practice-paragraph.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerificationGuard } from '../auth/guards/email-verification.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

/**
 * GET  /api/v1/practice/words/:wordId
 * GET  /api/v1/practice/words/:wordId/guess
 * POST /api/v1/practice/words/:wordId/guess
 * POST /api/v1/practice/words/:wordId/sentence
 * POST /api/v1/practice/words/:wordId/paragraph
 *
 * The Profile "My Words" review flow -- see PracticeService's doc
 * comment for what this deliberately does and doesn't do relative to
 * the real Daily Quest. Same throttle shape as QuestsController's
 * scored endpoints, for the same reason (a submission is the natural
 * target for an automated-farming attempt, even an unrewarded one).
 */
@Controller('practice')
@UseGuards(JwtAuthGuard, EmailVerificationGuard)
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  @Get('words/:wordId')
  getOverview(@CurrentUserId() userId: string, @Param('wordId') wordId: string) {
    return this.practice.getOverview(userId, wordId);
  }

  @Get('words/:wordId/guess')
  getGuessChallenge(@CurrentUserId() userId: string, @Param('wordId') wordId: string) {
    return this.practice.getGuessChallenge(userId, wordId);
  }

  @Post('words/:wordId/guess')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submitGuess(
    @CurrentUserId() userId: string,
    @Param('wordId') wordId: string,
    @Body() dto: SubmitPracticeGuessDto,
  ) {
    return this.practice.submitGuess(userId, wordId, dto.answer);
  }

  @Post('words/:wordId/sentence')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submitSentence(
    @CurrentUserId() userId: string,
    @Param('wordId') wordId: string,
    @Body() dto: SubmitPracticeSentenceDto,
  ) {
    return this.practice.submitSentence(userId, wordId, dto.sentence);
  }

  @Post('words/:wordId/paragraph')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submitParagraph(
    @CurrentUserId() userId: string,
    @Param('wordId') wordId: string,
    @Body() dto: SubmitPracticeParagraphDto,
  ) {
    return this.practice.submitParagraph(userId, wordId, dto.paragraph);
  }
}
