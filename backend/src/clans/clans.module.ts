import { Module } from '@nestjs/common';
import { ClansController } from './clans.controller';

@Module({
  controllers: [ClansController],
})
export class ClansModule {}
