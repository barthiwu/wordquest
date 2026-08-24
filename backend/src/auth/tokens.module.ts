import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * Global home for JwtService + JwtAuthGuard so any module (Users, and
 * later Quests/Battles/etc.) can protect a route with `@UseGuards(JwtAuthGuard)`
 * without creating a module-import cycle back through AuthModule/UsersModule.
 * Access/refresh secrets are still supplied per-call in AuthService, not here.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class TokensModule {}
