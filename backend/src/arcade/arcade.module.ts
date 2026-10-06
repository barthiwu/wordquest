import { Module } from '@nestjs/common';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { RewardEngineService } from './reward-engine.service';
import { ArcadeChallengeService } from './challenge.service';
import { NotificationModule } from '../notifications/notification.module';
import { ArcadePlayLimitService } from './limits/play-limit.service';
import { ArcadeStatusController } from './arcade-status.controller';

/**
 * Shared Arcade foundation module (spec §13 Phase 1). Hosts the
 * cross-game services — reward calculation and challenge selection —
 * that ScrambleQuest, Complete It, and Word Duel all depend on.
 * Game-specific modules (ScrambleQuestModule, CompleteItModule,
 * WordDuelModule — Phases 2-4) import this module rather than
 * redeclaring these providers.
 *
 * PrismaService is available without an explicit import here because
 * PrismaModule is @Global().
 */
@Module({
  imports: [VocabularyModule, NotificationModule],
  controllers: [ArcadeStatusController],
  providers: [RewardEngineService, ArcadeChallengeService, ArcadePlayLimitService],
  exports: [RewardEngineService, ArcadeChallengeService, ArcadePlayLimitService],
})
export class ArcadeModule {}
