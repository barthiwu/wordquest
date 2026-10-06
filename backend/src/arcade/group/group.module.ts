import { Module } from '@nestjs/common';
import { UsersModule } from '../../users/users.module';
import { ArcadeGroupService } from './group.service';
import { ArcadeGroupController } from './group.controller';

@Module({
  imports: [UsersModule],
  controllers: [ArcadeGroupController],
  providers: [ArcadeGroupService],
  exports: [ArcadeGroupService],
})
export class ArcadeGroupModule {}
