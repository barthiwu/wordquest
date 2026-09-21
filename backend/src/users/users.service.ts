import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LearningGoal } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { isValidTimezone } from '../common/timezone';
import { ObjectStorageService, type UploadContentType } from '../storage/object-storage.service';

const PASSWORD_SALT_ROUNDS = 12;

export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
  countryCode?: string;
  clanId?: string;
  /** Age gate (COPPA) — already validated as 13+ by AuthService.register before this is ever called. */
  dateOfBirth: Date;
}

/**
 * Owns user identity records + the 1:1 UserProgression snapshot row.
 * Password hashing lives here (never in the controller/DTO layer) so
 * there's exactly one place that turns a plaintext password into a hash.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(input: CreateUserInput) {
    const existing = await this.findByEmail(input.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.hashPassword(input.password);

    return this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        displayName: input.displayName,
        countryCode: input.countryCode,
        clanId: input.clanId,
        dateOfBirth: input.dateOfBirth,
        // Every new player starts with a real progression row, not a
        // lazily-created one — avoids null-checks scattered across every
        // module that reads XP/streak/journey state.
        progression: { create: {} },
      },
    });
  }

  /** The one place a plaintext password becomes a hash — also used by AuthService.resetPassword, not just create(). */
  hashPassword(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, PASSWORD_SALT_ROUNDS);
  }

  verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, passwordHash);
  }

  /**
   * Profile picture upload -- same two-step pattern as WordInTheWild's
   * evidence photos: the mobile app PUTs bytes directly to object
   * storage using a presigned URL, then tells us the key once that
   * succeeds. Keyed under "avatars/<userId>/..." so confirmAvatar can
   * verify a submitted key actually belongs to the caller before
   * trusting it.
   */
  createAvatarUploadTarget(userId: string, contentType: UploadContentType) {
    return this.storage.createUploadTarget(userId, contentType, 'avatars');
  }

  /**
   * `key` must come from a prior createAvatarUploadTarget() call for
   * THIS user, and the client must have already PUT the bytes there.
   * Replacing an existing avatar deletes the old object so orphaned
   * uploads don't pile up in the bucket.
   */
  async confirmAvatar(userId: string, key: string) {
    if (!key.startsWith(`avatars/${userId}/`)) {
      throw new ForbiddenException('That upload key does not belong to you');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: key },
    });

    if (existing?.avatarKey && existing.avatarKey !== key && this.storage.isStorageConfigured()) {
      await this.storage.delete(existing.avatarKey).catch(() => undefined);
    }

    return updated;
  }

  async removeAvatar(userId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });

    if (existing?.avatarKey && this.storage.isStorageConfigured()) {
      await this.storage.delete(existing.avatarKey).catch(() => undefined);
    }

    return this.prisma.user.update({ where: { id: userId }, data: { avatarKey: null } });
  }

  /** Resolves a stored avatarKey to a short-lived signed URL for display — null if no avatar or storage isn't configured. */
  async resolveAvatarUrl(avatarKey: string | null): Promise<string | null> {
    if (!avatarKey || !this.storage.isStorageConfigured()) return null;
    return this.storage.getDownloadUrl(avatarKey);
  }

  /**
   * Backs the onboarding screens + clan selection — a player fills these
   * in incrementally, so every field is optional and only present ones
   * are written.
   */
  async updateProfile(
    userId: string,
    input: {
      countryCode?: string;
      nativeLanguage?: string;
      targetLanguage?: string;
      timezone?: string;
      learningGoal?: LearningGoal;
      clanId?: string;
      completeOnboarding?: boolean;
    },
  ) {
    // The DTO only format-checks length; this is the real gate — reject
    // anything that isn't a timezone Node's ICU data actually recognizes,
    // since a bad value here would silently corrupt every downstream
    // localDate/streak/quest-window computation for this player.
    if (input.timezone !== undefined && !isValidTimezone(input.timezone)) {
      throw new BadRequestException(`"${input.timezone}" is not a recognized timezone`);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.countryCode !== undefined && { countryCode: input.countryCode }),
        ...(input.nativeLanguage !== undefined && { nativeLanguage: input.nativeLanguage }),
        ...(input.targetLanguage !== undefined && { targetLanguage: input.targetLanguage }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        ...(input.learningGoal !== undefined && { learningGoal: input.learningGoal }),
        ...(input.clanId !== undefined && { clanId: input.clanId }),
        ...(input.completeOnboarding && { onboardingCompletedAt: new Date() }),
      },
    });
  }
}
