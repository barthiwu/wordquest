import { Module } from '@nestjs/common';
import { PracticeService } from './practice.service';
import { PracticeController } from './practice.controller';
import { MasteryModule } from '../mastery/mastery.module';
import { SentenceModule } from '../sentence/sentence.module';
import { ParagraphModule } from '../paragraph/paragraph.module';

@Module({
  imports: [MasteryModule, SentenceModule, ParagraphModule],
  controllers: [PracticeController],
  providers: [PracticeService],
})
export class PracticeModule {}
