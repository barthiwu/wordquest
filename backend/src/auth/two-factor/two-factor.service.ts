import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp';

const ISSUER = 'WordQuest';
const RECOVERY_CODE_COUNT = 10;
// No 0/O/1/I/L: recovery codes get read off a screen and typed by hand.
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export interface TwoFactorStatus {
  enabled: boolean;
  recoveryCodesRemaining: number;
}

/**
 * TOTP two-step verification: secret storage (AES-256-GCM at rest),
 * enrolment (setup → confirm with a first valid code → one-time recovery
 * codes), and code checking at login with replay protection.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  // --- secret encryption -------------------------------------------------

  private key(): Buffer {
    const configured = this.config.twoFactorEncryptionKey;
    if (configured) {
      const buf = /^[0-9a-f]{64}$/i.test(configured)
        ? Buffer.from(configured, 'hex')
        : Buffer.from(configured, 'base64');
      if (buf.length !== 32) {
        throw new Error('TWO_FACTOR_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex chars or base64).');
      }
      return buf;
    }
    return createHash('sha256').update(`wordquest:2fa:${this.config.jwtRefreshSecret}`).digest();
  }

  encryptSecret(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
  }

  decryptSecret(enc: string): string {
    const raw = Buffer.from(enc, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  }

  // --- enrolment ----------------------------------------------------------

  async status(userId: string): Promise<TwoFactorStatus> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { twoFactorEnabledAt: true },
    });
    const remaining = user.twoFactorEnabledAt
      ? await this.prisma.twoFactorRecoveryCode.count({ where: { userId, usedAt: null } })
      : 0;
    return { enabled: !!user.twoFactorEnabledAt, recoveryCodesRemaining: remaining };
  }

  /** Starts (or restarts) enrolment: a fresh secret, not active until confirmed. */
  async beginSetup(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, twoFactorEnabledAt: true },
    });
    if (user.twoFactorEnabledAt) {
      throw new BadRequestException('Two-step verification is already turned on.');
    }
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecretEnc: this.encryptSecret(secret), twoFactorLastStep: null },
    });
    return { secret, otpauthUrl: otpauthUrl({ secret, accountName: user.email, issuer: ISSUER }) };
  }

  /** Confirms enrolment with a first valid code and returns the one-time recovery codes. */
  async confirmSetup(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { twoFactorSecretEnc: true, twoFactorEnabledAt: true },
    });
    if (user.twoFactorEnabledAt) throw new BadRequestException('Two-step verification is already turned on.');
    if (!user.twoFactorSecretEnc) throw new BadRequestException('Start two-step verification setup first.');
    const step = verifyTotp(this.decryptSecret(user.twoFactorSecretEnc), code);
    if (step === null) throw new BadRequestException('That code is not correct. Check the app and try again.');

    const recoveryCodes = this.generateRecoveryCodes();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabledAt: new Date(), twoFactorLastStep: step },
      }),
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.twoFactorRecoveryCode.createMany({
        data: recoveryCodes.map((c) => ({ userId, codeHash: this.hashRecoveryCode(c) })),
      }),
    ]);
    return { recoveryCodes };
  }

  /** Turns 2FA off. Requires a valid current code (TOTP or recovery) — a stolen session alone can't disable it. */
  async disable(userId: string, code: string): Promise<void> {
    if (!(await this.checkCode(userId, code))) {
      throw new UnauthorizedException('That code is not correct.');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorSecretEnc: null, twoFactorEnabledAt: null, twoFactorLastStep: null },
      }),
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    ]);
  }

  async regenerateRecoveryCodes(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    if (!(await this.checkCode(userId, code))) throw new UnauthorizedException('That code is not correct.');
    const recoveryCodes = this.generateRecoveryCodes();
    await this.prisma.$transaction([
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.twoFactorRecoveryCode.createMany({
        data: recoveryCodes.map((c) => ({ userId, codeHash: this.hashRecoveryCode(c) })),
      }),
    ]);
    return { recoveryCodes };
  }

  // --- login-time check ---------------------------------------------------

  /**
   * True when `code` is a valid current TOTP code (each time-step usable
   * once) or an unused recovery code (consumed on use). False otherwise —
   * the caller owns failure counting/lockout.
   */
  async checkCode(userId: string, code: string): Promise<boolean> {
    const submitted = code.trim();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecretEnc: true, twoFactorEnabledAt: true, twoFactorLastStep: true },
    });
    if (!user?.twoFactorEnabledAt || !user.twoFactorSecretEnc) return false;

    if (/^\d{3}\s?\d{3}$/.test(submitted)) {
      const step = verifyTotp(this.decryptSecret(user.twoFactorSecretEnc), submitted);
      if (step === null) return false;
      // Replay protection: a step already accepted can't be used again.
      if (user.twoFactorLastStep !== null && step <= user.twoFactorLastStep) return false;
      await this.prisma.user.update({ where: { id: userId }, data: { twoFactorLastStep: step } });
      return true;
    }

    const normalized = this.normalizeRecoveryCode(submitted);
    if (!normalized) return false;
    const result = await this.prisma.twoFactorRecoveryCode.updateMany({
      where: { userId, codeHash: this.hashRecoveryCode(normalized), usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }

  // --- recovery codes -------------------------------------------------------

  private generateRecoveryCodes(): string[] {
    const codes: string[] = [];
    while (codes.length < RECOVERY_CODE_COUNT) {
      const bytes = randomBytes(10);
      let raw = '';
      for (const b of bytes) raw += RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length];
      codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
    }
    return codes;
  }

  /** Accepts the code with or without the dash, any case; null if it can't be one. */
  private normalizeRecoveryCode(input: string): string | null {
    const compact = input.replace(/[\s-]/g, '').toUpperCase();
    if (compact.length !== 10 || [...compact].some((c) => !RECOVERY_ALPHABET.includes(c))) return null;
    return `${compact.slice(0, 5)}-${compact.slice(5)}`;
  }

  private hashRecoveryCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }
}
