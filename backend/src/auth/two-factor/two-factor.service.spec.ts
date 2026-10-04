import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { TwoFactorService } from './two-factor.service';
import { totpCode } from './totp';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppConfigService } from '../../config/config.service';

/** Tiny in-memory stand-in for the three Prisma calls the service makes. */
function build() {
  const state = {
    user: { id: 'u1', email: 'ada@example.com', twoFactorSecretEnc: null as string | null, twoFactorEnabledAt: null as Date | null, twoFactorLastStep: null as number | null },
    codes: [] as { userId: string; codeHash: string; usedAt: Date | null }[],
  };
  const prisma = {
    user: {
      findUniqueOrThrow: jest.fn(async () => ({ ...state.user })),
      findUnique: jest.fn(async () => ({ ...state.user })),
      update: jest.fn(async ({ data }: { data: Partial<typeof state.user> }) => { Object.assign(state.user, data); return state.user; }),
    },
    twoFactorRecoveryCode: {
      count: jest.fn(async () => state.codes.filter((c) => !c.usedAt).length),
      deleteMany: jest.fn(async () => { state.codes = []; return { count: 0 }; }),
      createMany: jest.fn(async ({ data }: { data: { userId: string; codeHash: string }[] }) => { state.codes.push(...data.map((d) => ({ ...d, usedAt: null }))); return { count: data.length }; }),
      findFirst: jest.fn(async ({ where }: { where: { userId: string; codeHash: string; usedAt: null } }) => state.codes.find((c) => c.codeHash === where.codeHash && !c.usedAt) ?? null),
      updateMany: jest.fn(async ({ where }: { where: { codeHash?: string } }) => {
        const hit = state.codes.find((c) => c.codeHash === where.codeHash && !c.usedAt);
        if (hit) hit.usedAt = new Date();
        return { count: hit ? 1 : 0 };
      }),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const config = { twoFactorEncryptionKey: 'ab'.repeat(32), jwtRefreshSecret: 'r' } as unknown as AppConfigService;
  return { svc: new TwoFactorService(prisma as unknown as PrismaService, config), state, prisma };
}

describe('TwoFactorService', () => {
  it('enrols: setup → confirm with a valid code → 10 recovery codes', async () => {
    const { svc, state } = build();
    const { secret, otpauthUrl } = await svc.beginSetup('u1');
    expect(otpauthUrl).toContain('otpauth://totp/');
    expect(state.user.twoFactorSecretEnc).toBeTruthy();
    expect(state.user.twoFactorSecretEnc).not.toContain(secret); // encrypted at rest

    await expect(svc.confirmSetup('u1', '000000')).rejects.toThrow(BadRequestException);

    const { recoveryCodes } = await svc.confirmSetup('u1', totpCode(secret, Date.now()));
    expect(recoveryCodes).toHaveLength(10);
    expect(recoveryCodes[0]).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect((await svc.status('u1'))).toEqual({ enabled: true, recoveryCodesRemaining: 10 });
  });

  it('checkCode accepts a TOTP once (replay-protected) and a recovery code once', async () => {
    const { svc } = build();
    const { secret } = await svc.beginSetup('u1');
    const t0 = Date.now();
    const { recoveryCodes } = await svc.confirmSetup('u1', totpCode(secret, t0));

    // The confirming step is already spent; the next step's code works exactly once.
    const next = totpCode(secret, t0 + 30_000);
    expect(await svc.checkCode('u1', totpCode(secret, t0))).toBe(false);
    jest.spyOn(Date, 'now').mockReturnValue(t0 + 30_000);
    expect(await svc.checkCode('u1', next)).toBe(true);
    expect(await svc.checkCode('u1', next)).toBe(false);
    jest.restoreAllMocks();

    expect(await svc.checkCode('u1', recoveryCodes[0])).toBe(true);
    expect(await svc.checkCode('u1', recoveryCodes[0])).toBe(false);
    expect(await svc.checkCode('u1', 'ZZZZZ-ZZZZZ')).toBe(false);
  });

  it('disable() needs a valid code and clears everything', async () => {
    const { svc, state } = build();
    const { secret } = await svc.beginSetup('u1');
    const { recoveryCodes } = await svc.confirmSetup('u1', totpCode(secret, Date.now()));
    await expect(svc.disable('u1', '123456')).rejects.toThrow(UnauthorizedException);
    await svc.disable('u1', recoveryCodes[1]);
    expect(state.user.twoFactorEnabledAt).toBeNull();
    expect(state.user.twoFactorSecretEnc).toBeNull();
    expect(state.codes).toHaveLength(0);
  });

  it('cannot start setup when already enabled', async () => {
    const { svc } = build();
    const { secret } = await svc.beginSetup('u1');
    await svc.confirmSetup('u1', totpCode(secret, Date.now()));
    await expect(svc.beginSetup('u1')).rejects.toThrow(BadRequestException);
  });
});
