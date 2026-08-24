import { Module } from '@nestjs/common';
import { LearningProfileService } from './learning-profile.service';
import { LearningProfileController } from './learning-profile.controller';

@Module({
  providers: [LearningProfileService],
  controllers: [LearningProfileController],
  exports: [LearningProfileService],
})
export class LearningProfileModule {}
