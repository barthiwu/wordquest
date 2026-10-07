import { Module } from '@nestjs/common';
import { UsersModule } from '../../users/users.module';
import { AuthModule } from '../../auth/auth.module';
import { ArcadeGroupService } from './group.service';
import { ArcadeGroupController } from './group.controller';
import { ArcadeGuestService } from './guest.service';
import { ArcadeGuestController } from './guest.controller';

@Module({
  imports: [UsersModule, AuthModule],
  controllers: [ArcadeGroupController, ArcadeGuestController],
  providers: [ArcadeGroupService, ArcadeGuestService],
  exports: [ArcadeGroupService],
})
export class ArcadeGroupModule {}
