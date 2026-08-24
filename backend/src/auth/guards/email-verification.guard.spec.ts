import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { EmailVerificationGuard } from './email-verification.guard';

function contextWithUserId(userId: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ userId }),
    }),
  } as unknown as ExecutionContext;
}

describe('EmailVerificationGuard', () => {
  const prismaMock = { user: { findUnique: jest.fn() } };
  const guard = new EmailVerificationGuard(prismaMock as any);

  beforeEach(() => jest.clearAllMocks());

  it('allows the request through when there is no userId on it yet', async () => {
    await expect(guard.canActivate(contextWithUserId(undefined))).resolves.toBe(true);
  });

  it('allows a verified user through regardless of account age', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      emailVerifiedAt: new Date(),
      createdAt: new Date('2020-01-01'),
    });
    await expect(guard.canActivate(contextWithUserId('u1'))).resolves.toBe(true);
  });

  it('allows an unverified user through while still inside the grace period', async () => {
    const createdAt = new Date();
    createdAt.setHours(createdAt.getHours() - 1); // 1 hour old, well inside the multi-day grace window
    prismaMock.user.findUnique.mockResolvedValue({ emailVerifiedAt: null, createdAt });
    await expect(guard.canActivate(contextWithUserId('u1'))).resolves.toBe(true);
  });

  it('blocks an unverified user once the grace period has elapsed', async () => {
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - 30); // well past the grace window
    prismaMock.user.findUnique.mockResolvedValue({ emailVerifiedAt: null, createdAt });
    await expect(guard.canActivate(contextWithUserId('u1'))).rejects.toThrow(ForbiddenException);
  });
});
