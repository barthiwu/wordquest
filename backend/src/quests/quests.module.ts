import { Module } from '@nestjs/common';
import { QuestsService } from './quests.service';
import { QuestsController } from './quests.controller';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { MasteryModule } from '../mastery/mastery.module';
import { ProgressionModule } from '../progression/progression.module';
import { AchievementModule } from '../achievement/achievement.module';
import { SentenceModule } from '../sentence/sentence.module';
import { ParagraphModule } from '../paragraph/paragraph.module';
import { WordInTheWildModule } from '../word-in-the-wild/word-in-the-wild.module';
import { LearningProfileModule } from '../learning-profile/learning-profile.module';
import { AliModule } from '../ali/ali.module';

@Module({
  imports: [
    VocabularyModule,
    MasteryModule,
    ProgressionModule,
    AchievementModule,
    SentenceModule,
    ParagraphModule,
    WordInTheWildModule,
    LearningProfileModule,
    AliModule,
  ],
  controllers: [QuestsController],
  providers: [QuestsService],
})
export class QuestsModule {}
