import { Module } from '@nestjs/common';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { RewardEngineService } from './reward-engine.service';
import { ArcadeChallengeService } from './challenge.service';
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
  imports: [VocabularyModule],
  controllers: [ArcadeStatusController],
  providers: [RewardEngineService, ArcadeChallengeService],
  exports: [RewardEngineService, ArcadeChallengeService],
})
export class ArcadeModule {}
