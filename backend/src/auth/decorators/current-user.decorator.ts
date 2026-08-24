import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from '../guards/jwt-auth.guard';

/**
 * Usage: `getMe(@CurrentUserId() userId: string)` on a route behind
 * JwtAuthGuard. Keeps controllers from reaching into `req.userId` directly.
 */
export const CurrentUserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.userId) {
    throw new Error('CurrentUserId used outside of a JwtAuthGuard-protected route');
  }
  return request.userId;
});
