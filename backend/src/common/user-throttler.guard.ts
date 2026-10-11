import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { THROTTLE_BY_IP_KEY } from './throttle-by-ip.decorator';

/**
 * The rate limiter, counting per signed-in player instead of per IP address
 * whenever the request carries a valid access token.
 *
 * Why: everyone on one school Wi-Fi (or one mobile carrier's NAT) shares a
 * single public IP. Counting per IP made a classroom of 50 students playing a
 * Group Play round share one 120-requests-a-minute budget between all of
 * them, so most would have been refused within seconds. Counting per player
 * gives each student their own budget.
 *
 * Requests with no token, a bad token or an expired one still count per IP.
 * Routes marked @ThrottleByIp() (the whole auth controller: register, login,
 * password reset, social sign-in, 2FA...) count per IP even WITH a valid
 * token, because a token is free to get (guest play) and would otherwise hand
 * an attacker a fresh budget per request. The token is verified, not just
 * decoded: a forged `sub` must not let someone burn another player's budget.
 */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  @Inject(JwtService) private readonly jwt!: JwtService;
  @Inject(AppConfigService) private readonly appConfig!: AppConfigService;

  // The throttler passes the ExecutionContext as a second argument at runtime
  // even though its typings only declare the request.
  protected async getTracker(
    req: Record<string, unknown>,
    context?: ExecutionContext,
  ): Promise<string> {
    // Credential routes (login, register, reset...) always count per IP.
    if (
      context &&
      this.reflector.getAllAndOverride<boolean>(THROTTLE_BY_IP_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return req.ip as string;
    }
    const headers = req.headers as Record<string, string | undefined> | undefined;
    const header = headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub?: string }>(
          header.slice('Bearer '.length),
          {
            secret: this.appConfig.jwtAccessSecret,
          },
        );
        if (payload.sub) return `user:${payload.sub}`;
      } catch {
        // Fall through to the IP address.
      }
    }
    return req.ip as string;
  }
}
