import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppConfigService } from '../config/config.service';

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
 * Requests with no token, a bad token or an expired one still count per IP,
 * so the routes that matter for abuse (register, login, password reset) keep
 * their per-IP limits exactly as before. The token is verified, not just
 * decoded: a forged `sub` must not let someone burn another player's budget.
 */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  @Inject(JwtService) private readonly jwt!: JwtService;
  @Inject(AppConfigService) private readonly appConfig!: AppConfigService;

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
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
