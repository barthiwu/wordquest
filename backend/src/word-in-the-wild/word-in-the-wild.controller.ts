import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WordInTheWildService } from './word-in-the-wild.service';
import { CreateMissionDto } from './dto/create-mission.dto';
import { SubmitEvidenceDto } from './dto/submit-evidence.dto';
import { PhotoUploadUrlDto } from './dto/photo-upload-url.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerificationGuard } from '../auth/guards/email-verification.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

/**
 * Spec v2 §19 API surface, adapted to Nest's routing conventions:
 *   POST   /word-in-the-wild/missions
 *   POST   /word-in-the-wild/missions/:missionId/photo-upload-url
 *   POST   /word-in-the-wild/submissions
 *   GET    /word-in-the-wild/submissions/:id
 *   DELETE /word-in-the-wild/submissions/:id
 * Mission creation and evidence submission both get tighter limits than
 * the app-wide default (spec v2 §20) — each one can trigger a real,
 * billed Claude call, so uncontrolled request volume here is a cost
 * problem as well as an abuse one.
 */
@Controller('word-in-the-wild')
@UseGuards(JwtAuthGuard, EmailVerificationGuard)
export class WordInTheWildController {
  constructor(private readonly witw: WordInTheWildService) {}

  @Post('missions')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createMission(@CurrentUserId() userId: string, @Body() dto: CreateMissionDto) {
    return this.witw.createMission(userId, dto.wordId);
  }

  @Post('missions/:missionId/photo-upload-url')
  createPhotoUploadTarget(
    @CurrentUserId() userId: string,
    @Param('missionId') missionId: string,
    @Body() dto: PhotoUploadUrlDto,
  ) {
    return this.witw.createPhotoUploadTarget(userId, missionId, dto.contentType);
  }

  @Post('submissions')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  submitEvidence(@CurrentUserId() userId: string, @Body() dto: SubmitEvidenceDto) {
    if (dto.evidenceType === 'TEXT') {
      return this.witw.submitTextEvidence(userId, dto.missionId, dto.text!);
    }
    return this.witw.submitPhotoEvidence(userId, dto.missionId, dto.photoKey!);
  }

  @Get('submissions/:id')
  getSubmission(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.witw.getSubmission(userId, id);
  }

  @Delete('submissions/:id')
  async deleteSubmission(@CurrentUserId() userId: string, @Param('id') id: string) {
    await this.witw.deleteSubmission(userId, id);
    return { deleted: true };
  }
}
