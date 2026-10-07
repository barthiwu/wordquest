import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AppConfigService } from '../../config/config.service';
import { ALLOW_GUEST_KEY, guestRestricted } from '../decorators/allow-guest.decorator';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  /** True for a guest session (see AllowGuest). */
  isGuest?: boolean;
}

/**
 * Verifies the access token on protected routes and attaches `userId` to
 * the request. Deliberately not passport-based — this is a small enough
 * surface that a direct JwtService.verifyAsync call is easier to read and
 * test than a Strategy indirection layer.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: { sub: string; guest?: boolean };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; guest?: boolean }>(token, {
        secret: this.config.jwtAccessSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    request.userId = payload.sub;
    if (payload.guest === true) {
      request.isGuest = true;
      const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_GUEST_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowed) throw guestRestricted();
    }
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length);
  }
}
