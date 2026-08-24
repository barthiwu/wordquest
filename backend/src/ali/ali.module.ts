import { Module } from '@nestjs/common';
import { AliController } from './ali.controller';
import { AliService } from './ali.service';

@Module({
  controllers: [AliController],
  providers: [AliService],
  exports: [AliService],
})
export class AliModule {}
