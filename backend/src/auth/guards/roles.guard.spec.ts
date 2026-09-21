import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

function contextWithUserId(userId: string | undefined, requiredRoles: string[] | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ userId }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const prismaMock = { user: { findUnique: jest.fn() } };
  const reflectorMock = { getAllAndOverride: jest.fn() };
  const guard = new RolesGuard(reflectorMock as any, prismaMock as any);

  beforeEach(() => jest.clearAllMocks());

  it('allows the request through untouched when the route has no @Roles() metadata', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(contextWithUserId('u1', undefined))).resolves.toBe(true);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('allows the request through when @Roles() lists an empty array', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue([]);
    await expect(guard.canActivate(contextWithUserId('u1', []))).resolves.toBe(true);
  });

  it('rejects when there is no userId on the request (JwtAuthGuard did not run first)', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(['ADMIN']);
    await expect(guard.canActivate(contextWithUserId(undefined, ['ADMIN']))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("rejects a user whose role isn't in the required list", async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(['ADMIN', 'SUPPORT']);
    prismaMock.user.findUnique.mockResolvedValue({ role: 'USER' });
    await expect(guard.canActivate(contextWithUserId('u1', ['ADMIN', 'SUPPORT']))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects when the user no longer exists', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(['ADMIN']);
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(contextWithUserId('u1', ['ADMIN']))).rejects.toThrow(ForbiddenException);
  });

  it("allows a user whose role is in the required list", async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(['ADMIN', 'SUPPORT']);
    prismaMock.user.findUnique.mockResolvedValue({ role: 'SUPPORT' });
    await expect(guard.canActivate(contextWithUserId('u1', ['ADMIN', 'SUPPORT']))).resolves.toBe(true);
  });
});
