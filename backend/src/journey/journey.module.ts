import { Module } from '@nestjs/common';
import { JourneyController } from './journey.controller';

@Module({
  controllers: [JourneyController],
})
export class JourneyModule {}
