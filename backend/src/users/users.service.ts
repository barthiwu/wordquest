import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LearningGoal } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { isValidTimezone } from '../common/timezone';

const PASSWORD_SALT_ROUNDS = 12;

export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
  countryCode?: string;
  clanId?: string;
}

/**
 * Owns user identity records + the 1:1 UserProgression snapshot row.
 * Password hashing lives here (never in the controller/DTO layer) so
 * there's exactly one place that turns a plaintext password into a hash.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
