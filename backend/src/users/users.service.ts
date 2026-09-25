import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LearningGoal } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { isValidTimezone } from '../common/timezone';
import { getAgeRange } from '../common/age';
import { gameplayRules } from '../config/gameplay-rules';
import { ObjectStorageService, type UploadContentType } from '../storage/object-storage.service';

const PASSWORD_SALT_ROUNDS = 12;

/**
 * Lowercase letters, digits, and underscores only, 3-20 characters —
 * see the `username` field's doc comment in schema.prisma for why
 * (keeps uniqueness a plain case-sensitive unique index instead of a
 * separate lower(username) one, and avoids look-alike collisions like
 * "Alex" vs "alex"). Shared by UpdateMeDto's format check and this
 * service's own defensive re-check before writing.
 */
export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

/**
 * A starting username derived from a real name, always unique by
 * construction: normalize to the allowed character set, fall back to
 * "player" if nothing survives (e.g. a name in a non-Latin script), and
 * suffix an 8-hex-char slice of the row's own id (already globally
 * unique). Mirrors the raw-SQL backfill in the add_user_username
 * migration — change one, change both. Never shown as "the" username
 * for long: it's a placeholder the player is expected to replace with
 * something they actually chose, via Settings.
 */
export function generateDefaultUsername(displayName: string, id: string): string {
  const normalized = displayName.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const base = normalized.length > 0 ? normalized.slice(0, 11) : 'player';
  const suffix = id.replace(/-/g, '').slice(0, 8);
  return `${base}_${suffix}`;
}

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

    // Generated (not player-submitted) at registration, so the sign-up
    // form doesn't need a new required field just to satisfy the
    // uniqueness constraint — the player renames it to something they
    // actually chose from Settings whenever they like. A retry loop
    // costs nothing and guards against a future change to
    // generateDefaultUsername's uniqueness scheme.
    for (let attempt = 0; attempt < 5; attempt++) {
      const username = generateDefaultUsername(input.displayName, randomUUID());
      try {
        // A friendlier STARTING currentDifficulty from the player's age
        // range (Barth, Sept 2026) — Initial Calibration (LearningProfileService,
        // first 3 Daily Quest words) still runs on top of this and can move
        // the player up or down; this just avoids everyone blanket-starting
        // at BEGINNER regardless of age. See gameplay-rules.ts's
        // startingDifficultyByAgeRange doc comment for why it's conservative.
        const startingDifficulty =
          gameplayRules.learningProfile.startingDifficultyByAgeRange[
            getAgeRange(input.dateOfBirth)
          ];

        return await this.prisma.user.create({
          data: {
            email: input.email.toLowerCase(),
            passwordHash,
            displayName: input.displayName,
            username,
            countryCode: input.countryCode,
            clanId: input.clanId,
            dateOfBirth: input.dateOfBirth,
            // Every new player starts with a real progression row, not a
            // lazily-created one — avoids null-checks scattered across every
            // module that reads XP/streak/journey state.
            progression: { create: {} },
            // Same reasoning — a real LearningProfile row from day one,
            // seeded with an age-appropriate starting difficulty instead of
            // relying on the schema's blanket BEGINNER default.
            learningProfile: { create: { currentDifficulty: startingDifficulty } },
          },
        });
      } catch (err) {
        const isUsernameConflict =
          err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002';
        if (isUsernameConflict && attempt < 4) continue;
        throw err;
      }
    }
    throw new ConflictException('Could not generate a unique username — please try again');
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
      displayName?: string;
      username?: string;
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

    if (input.username !== undefined) {
      // The DTO already format-checks this; re-checking here means the
      // format guarantee holds for every caller of this service method,
      // not just the HTTP one.
      if (!USERNAME_REGEX.test(input.username)) {
        throw new BadRequestException(
          'Username must be 3-20 characters, lowercase letters, numbers, and underscores only',
        );
      }
      const holder = await this.prisma.user.findUnique({
        where: { username: input.username },
        select: { id: true },
      });
      if (holder && holder.id !== userId) {
        throw new ConflictException('That username is already taken');
      }
    }

    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(input.displayName !== undefined && { displayName: input.displayName }),
          ...(input.username !== undefined && { username: input.username }),
          ...(input.countryCode !== undefined && { countryCode: input.countryCode }),
          ...(input.nativeLanguage !== undefined && { nativeLanguage: input.nativeLanguage }),
          ...(input.targetLanguage !== undefined && { targetLanguage: input.targetLanguage }),
          ...(input.timezone !== undefined && { timezone: input.timezone }),
          ...(input.learningGoal !== undefined && { learningGoal: input.learningGoal }),
          ...(input.clanId !== undefined && { clanId: input.clanId }),
          ...(input.completeOnboarding && { onboardingCompletedAt: new Date() }),
        },
      });
    } catch (err) {
      // Closes the race between the availability check above and this
      // write with the database's own unique constraint, rather than
      // trusting the check alone.
      const isUsernameConflict =
        err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002';
      if (isUsernameConflict) {
        throw new ConflictException('That username is already taken');
      }
      throw err;
    }
  }

  /**
   * Backs a live "is this available?" check in Settings, before the
   * player commits to a username via updateProfile -- format-invalid
   * input is reported as unavailable rather than throwing, since this
   * is UI feedback, not a write path with its own validation contract.
   */
  async isUsernameAvailable(username: string, currentUserId: string): Promise<boolean> {
    if (!USERNAME_REGEX.test(username)) return false;
    const holder = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    return !holder || holder.id === currentUserId;
  }
}
