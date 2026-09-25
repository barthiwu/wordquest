import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { QuestsService } from './quests.service';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { SubmitSentenceDto } from './dto/submit-sentence.dto';
import { SubmitParagraphDto } from './dto/submit-paragraph.dto';
import { CheckHistoryAnswerDto } from './dto/check-history-answer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerificationGuard } from '../auth/guards/email-verification.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';
import { PlayerClockService } from '../common/player-clock.service';

/**
 * GET  /api/v1/quests
 * POST /api/v1/quests/:questKey/start
 * POST /api/v1/quests/attempts/:attemptId/answer
 * POST /api/v1/quests/attempts/:attemptId/hint
 * POST /api/v1/quests/attempts/:attemptId/synonym
 * POST /api/v1/quests/attempts/:attemptId/reveal-letter
 * POST /api/v1/quests/attempts/:attemptId/acknowledge-understanding
 * POST /api/v1/quests/attempts/:attemptId/sentence
 * POST /api/v1/quests/attempts/:attemptId/paragraph
 * POST /api/v1/quests/attempts/:attemptId/complete-word
 * (Speaking/Pronunciation removed from V1 — Correction & Completion Spec
 * §2 — Paragraph now advances directly to Optional Wild.)
 * All routes protected — the Quest Engine only ever acts on the
 * authenticated player's own attempts (enforced again inside the service).
 * answer submission gets its own tighter limit (spec v2 §20) — it's
 * where reward-granting actually happens, the natural target for an
 * automated XP-farming attempt, distinct from the app-wide default.
 */
@Controller('quests')
@UseGuards(JwtAuthGuard, EmailVerificationGuard)
export class QuestsController {
  constructor(
    private readonly quests: QuestsService,
    private readonly clock: PlayerClockService,
  ) {}

  @Get()
  list() {
    return this.quests.listQuests();
  }

  // Read-only aggregation over today's QuestAttempt rows (see
  // QuestsService.getTodaySummary) — backs Home's Daily Goals card with
  // a real "N of 3 today" count instead of an invented target.
  @Get('today')
  async today(@CurrentUserId() userId: string) {
    const { localDate } = await this.clock.now(userId);
    return this.quests.getTodaySummary(userId, localDate);
  }

  // No request body anymore (Player Timezone System, V1 Remaining Systems
  // Spec §15) — localDate/localHour used to be client-submitted; the
  // server now derives both from the player's own stored timezone, which
  // is the whole point ("never trust the device clock").
  @Post(':questKey/start')
  async start(@CurrentUserId() userId: string, @Param('questKey') questKey: string) {
    const { localDate, localHour } = await this.clock.now(userId);
    return this.quests.startTimedQuest(userId, questKey, localDate, localHour);
  }

  // Catch-up calendar: past days only (see QuestsService.getHistoryForDate/
  // listHistoryDates) — registered before ':questKey/start' would matter
  // if 'history' could ever collide with a real questKey, but quest keys
  // are seed data ('morning-quest', etc.), so no collision risk here.
  @Get('history/dates')
  async historyDates(@CurrentUserId() userId: string) {
    const { localDate } = await this.clock.now(userId);
    return this.quests.listHistoryDates(userId, localDate);
  }

  @Get('history/:localDate')
  async history(@CurrentUserId() userId: string, @Param('localDate') localDate: string) {
    const { localDate: todayLocalDate } = await this.clock.now(userId);
    return this.quests.getHistoryForDate(userId, localDate, todayLocalDate);
  }

  @Post('history/check')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  checkHistoryAnswer(@Body() dto: CheckHistoryAnswerDto) {
    return this.quests.checkHistoryAnswer(dto.wordId, dto.answer);
  }

  @Post('attempts/:attemptId/answer')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submitAnswer(
    @CurrentUserId() userId: string,
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitAnswerDto,
  ) {
    return this.quests.submitAnswer(userId, attemptId, dto.answer);
  }

  @Post('attempts/:attemptId/hint')
  requestHint(@CurrentUserId() userId: string, @Param('attemptId') attemptId: string) {
    return this.quests.requestHint(userId, attemptId);
  }

  @Post('attempts/:attemptId/synonym')
  requestSynonym(@CurrentUserId() userId: string, @Param('attemptId') attemptId: string) {
    return this.quests.requestSynonym(userId, attemptId);
  }

  @Post('attempts/:attemptId/reveal-letter')
  requestLetterReveal(@CurrentUserId() userId: string, @Param('attemptId') attemptId: string) {
    return this.quests.requestLetterReveal(userId, attemptId);
  }

  @Post('attempts/:attemptId/acknowledge-understanding')
  acknowledgeUnderstanding(@CurrentUserId() userId: string, @Param('attemptId') attemptId: string) {
    return this.quests.acknowledgeUnderstanding(userId, attemptId);
  }

  @Post('attempts/:attemptId/sentence')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submitSentence(
    @CurrentUserId() userId: string,
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitSentenceDto,
  ) {
    return this.quests.submitSentence(userId, attemptId, dto.sentence);
  }

  @Post('attempts/:attemptId/paragraph')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submitParagraph(
    @CurrentUserId() userId: string,
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitParagraphDto,
  ) {
    return this.quests.submitParagraph(userId, attemptId, dto.paragraph);
  }

  @Post('attempts/:attemptId/complete-word')
  completeWord(@CurrentUserId() userId: string, @Param('attemptId') attemptId: string) {
    return this.quests.completeWord(userId, attemptId);
  }

  @Post('attempts/:attemptId/optional-wild-mission')
  createOptionalWildMission(
    @CurrentUserId() userId: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.quests.createOptionalWildMission(userId, attemptId);
  }
}
