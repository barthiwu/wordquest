import { createParamDecorator, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import type { AuthenticatedRequest } from '../guards/jwt-auth.guard';

export const ALLOW_GUEST_KEY = 'wordquest:allowGuest';

/**
 * Guest players (people who joined a Group Play link without an account) are
 * refused by JwtAuthGuard on every route unless it is marked with this
 * decorator -- an allow-list, so a new feature is closed to guests by default.
 * Works on a controller class or on a single handler.
 */
export const AllowGuest = () => SetMetadata(ALLOW_GUEST_KEY, true);

/** Body of the 403 a guest gets on a route that needs an account; the app keys off `code`. */
export const GUEST_RESTRICTED_CODE = 'GUEST_RESTRICTED';

export function guestRestricted(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    code: GUEST_RESTRICTED_CODE,
    message: 'Create a free account to use this feature.',
    error: 'Forbidden',
  });
}

/** True when the caller signed in as a guest (set by JwtAuthGuard). */
export const IsGuest = createParamDecorator((_: unknown, ctx: ExecutionContext): boolean => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().isGuest === true;
});

/** Guests may only play inside a group: a solo or one-on-one start is refused. */
export function assertGuestStartsGroupOnly(isGuest: boolean, groupId?: string): void {
  if (isGuest && !groupId) throw guestRestricted();
}
