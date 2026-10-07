import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard, type AuthenticatedRequest } from './jwt-auth.guard';
import { AllowGuest, GUEST_RESTRICTED_CODE } from '../decorators/allow-guest.decorator';

class Plain {
  open() {}
}
class Open {
  @AllowGuest()
  open() {}
  closed() {}
}
@AllowGuest()
class WholeController {
  any() {}
}

function ctx(req: Partial<AuthenticatedRequest>, cls: new () => object, handler: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => (cls.prototype as Record<string, () => void>)[handler],
    getClass: () => cls,
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard guest allow-list', () => {
  const jwt = { verifyAsync: jest.fn() };
  const config = { jwtAccessSecret: 's' };
  const guard = new JwtAuthGuard(jwt as never, config as never, new Reflector());
  const req = () => ({ headers: { authorization: 'Bearer t' } }) as unknown as AuthenticatedRequest;

  beforeEach(() => jest.clearAllMocks());

  it('lets a normal account through everywhere and does not mark it as a guest', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1' });
    const r = req();
    await expect(guard.canActivate(ctx(r, Plain, 'open'))).resolves.toBe(true);
    expect(r.userId).toBe('u1');
    expect(r.isGuest).toBeUndefined();
  });

  it('refuses a guest on a route nobody opened to guests, with a code the app can read', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'g1', guest: true });
    const attempt = guard.canActivate(ctx(req(), Plain, 'open'));
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toMatchObject({
      response: expect.objectContaining({ code: GUEST_RESTRICTED_CODE }),
    });
  });

  it('allows a guest on a handler or a whole controller marked AllowGuest', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'g1', guest: true });
    const r = req();
    await expect(guard.canActivate(ctx(r, Open, 'open'))).resolves.toBe(true);
    expect(r.isGuest).toBe(true);
    await expect(guard.canActivate(ctx(req(), WholeController, 'any'))).resolves.toBe(true);
  });

  it('keeps other handlers of a partly-open controller closed to guests', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'g1', guest: true });
    await expect(guard.canActivate(ctx(req(), Open, 'closed'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('still rejects missing and invalid tokens', async () => {
    await expect(
      guard.canActivate(ctx({ headers: {} } as never, Plain, 'open')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    jwt.verifyAsync.mockRejectedValue(new Error('bad'));
    await expect(guard.canActivate(ctx(req(), Plain, 'open'))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
