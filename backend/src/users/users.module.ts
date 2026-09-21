import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MasteryModule } from '../mastery/mastery.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [MasteryModule, StorageModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
