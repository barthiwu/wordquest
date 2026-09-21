import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TokensModule } from './tokens.module';
import { UsersModule } from '../users/users.module';
import { EmailModule } from '../email/email.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [UsersModule, TokensModule, EmailModule, AnalyticsModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
