import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/**
 * First admin-facing authorization in the app — everything before this
 * (moderation reports/photo review) was the first thing to actually read
 * User.role. Always applied AFTER JwtAuthGuard (reads request.userId,
 * doesn't verify the token itself) and alongside `@Roles(...)`; a route
 * with no `@Roles()` metadata is allowed through untouched, so this guard
 * is inert unless explicitly opted into.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.userId) {
      throw new ForbiddenException('Not authorized for this resource.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: request.userId },
      select: { role: true },
    });
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Not authorized for this resource.');
    }
    return true;
  }
}
