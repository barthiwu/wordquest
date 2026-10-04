import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService, type RequestMeta } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RecoverAccountDto } from './dto/recover-account.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { TwoFactorCodeDto, TwoFactorLoginDto } from './dto/two-factor.dto';
import { TwoFactorService } from './two-factor/two-factor.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUserId } from './decorators/current-user.decorator';

/**
 * POST /api/v1/auth/{register,login,refresh,logout}
 * POST /api/v1/auth/change-password       (protected)
 * POST /api/v1/auth/verify-email
 * POST /api/v1/auth/resend-verification   (protected)
 * POST /api/v1/auth/request-password-reset
 * POST /api/v1/auth/reset-password
 * POST /api/v1/auth/delete-account        (protected)
 * GET  /api/v1/auth/export-data           (protected)
 * POST /api/v1/auth/recover-account
 * GET  /api/v1/auth/providers, POST /api/v1/auth/social
 * POST /api/v1/auth/2fa/login; GET 2fa/status, POST 2fa/{setup,enable,disable,recovery-codes} (protected)
 * Tighter rate limits than the app-wide default — credential endpoints are
 * the highest-value target for automated abuse (BUILD_HANDOFF §44/§45).
 */
/** Pulls the audit-log-only IP/user-agent off the request — best-effort, never required. */
function requestMeta(req: Request): RequestMeta {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, requestMeta(req));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async logout(@Body() dto: RefreshTokenDto) {
    await this.auth.logout(dto.refreshToken);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async changePassword(@CurrentUserId() userId: string, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(userId, dto.currentPassword, dto.newPassword);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.auth.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async resendVerification(@CurrentUserId() userId: string) {
    await this.auth.sendVerificationEmail(userId);
  }

  @Post('request-password-reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    await this.auth.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @Post('delete-account')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async deleteAccount(@CurrentUserId() userId: string) {
    await this.auth.deleteAccount(userId);
  }

  /** Privacy controls (Sprint 5) — "download my data." See AuthService.exportUserData for exactly what's included. */
  @Get('export-data')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  exportData(@CurrentUserId() userId: string) {
    return this.auth.exportUserData(userId);
  }

  @Post('recover-account')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  recoverAccount(@Body() dto: RecoverAccountDto) {
    return this.auth.recoverAccount(dto);
  }

  /** Which social sign-in providers this deployment has configured. */
  @Get('providers')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  providers() {
    return this.auth.getSocialProviders();
  }

  /** Google / Apple / Facebook sign-in or sign-up. May return a 2FA challenge. */
  @Post('social')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  social(@Body() dto: SocialLoginDto, @Req() req: Request) {
    return this.auth.socialLogin(dto, requestMeta(req));
  }

  /** Second step of login for accounts with two-step verification on. */
  @Post('2fa/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  twoFactorLogin(@Body() dto: TwoFactorLoginDto, @Req() req: Request) {
    return this.auth.completeTwoFactorLogin(dto.challengeToken, dto.code, requestMeta(req));
  }

  @Get('2fa/status')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  twoFactorStatus(@CurrentUserId() userId: string) {
    return this.twoFactor.status(userId);
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  twoFactorSetup(@CurrentUserId() userId: string) {
    return this.twoFactor.beginSetup(userId);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  twoFactorEnable(@CurrentUserId() userId: string, @Body() dto: TwoFactorCodeDto) {
    return this.twoFactor.confirmSetup(userId, dto.code);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async twoFactorDisable(@CurrentUserId() userId: string, @Body() dto: TwoFactorCodeDto) {
    await this.twoFactor.disable(userId, dto.code);
  }

  @Post('2fa/recovery-codes')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  twoFactorRecoveryCodes(@CurrentUserId() userId: string, @Body() dto: TwoFactorCodeDto) {
    return this.twoFactor.regenerateRecoveryCodes(userId, dto.code);
  }
}
