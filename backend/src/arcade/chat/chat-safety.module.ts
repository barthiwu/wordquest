import { Module } from '@nestjs/common';
import { ChatSafetyService } from './chat-safety.service';

@Module({
  providers: [ChatSafetyService],
  exports: [ChatSafetyService],
})
export class ChatSafetyModule {}
