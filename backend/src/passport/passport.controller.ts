import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';
import { JOURNEY_STAGES } from '../config/journey-stages';
import { ACHIEVEMENT_CATALOG } from '../achievement/achievement-catalog';
import { ORDER_CATALOG } from '../order/order-catalog';
import { QuestCardService } from '../quest-card/quest-card.service';
import { ObjectStorageService } from '../storage/object-storage.service';

/**
 * GET /api/v1/passport/me — Screen Bible screen 28 (Learning Passport,
 * §28). A read-only aggregator, not its own data owner: everything it
 * returns already lives in User/UserProgression/Clan/AchievementUnlock/
 * BossBattlePlayer/OrderSelection/CefrAssessment/QuestCard — this just
 * joins and shapes it. Achievements and Boss Battle history used to be
 * hardcoded empty arrays here (a placeholder from before those modules
 * existed); both now read the real rows. showcasedCards is the same
 * fix for Quest Cards (V22 §7/§9 finding): the showcase endpoints
 * existed and worked, but nothing surfaced the result on the profile.
 */
@Controller('passport')
@UseGuards(JwtAuthGuard)
export class PassportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questCards: QuestCardService,
    private readonly storage: ObjectStorageService,
  ) {}

  @Get('me')
  async me(@CurrentUserId() userId: string) {
    const [user, unlocks, battleHistory, latestOrder, showcasedCards] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: { clan: true, progression: true },
      }),
      this.prisma.achievementUnlock.findMany({
        where: { userId },
        orderBy: { unlockedAt: 'desc' },
      }),
      this.prisma.bossBattlePlayer.findMany({
        where: { userId, finalRank: { not: null } },
        include: { group: { include: { battle: { select: { weekId: true } } } } },
        orderBy: { joinedAt: 'desc' },
      }),
      this.prisma.orderSelection.findFirst({ where: { userId }, orderBy: { selectedAt: 'desc' } }),
      this.questCards.listShowcase(userId),
    ]);

    const journeyStageName =
      JOURNEY_STAGES.find((s) => s.stage === user.progression?.journeyStage)?.name ??
      JOURNEY_STAGES[0].name;

    const orderEntry = latestOrder
      ? (ORDER_CATALOG.find((o) => o.key === latestOrder.order) ?? null)
      : null;

    const avatarUrl =
      user.avatarKey && this.storage.isStorageConfigured()
        ? await this.storage.getDownloadUrl(user.avatarKey)
        : null;

    return {
      displayName: user.displayName,
      username: user.username,
      avatarUrl,
      countryCode: user.countryCode,
      clan: user.clan ? { name: user.clan.name, bannerAsset: user.clan.bannerAsset } : null,
      level: user.progression?.level ?? 1,
      totalXp: user.progression?.totalXp ?? 0,
      journeyStageName,
      wordsMastered: user.progression?.masteredWordsCount ?? 0,
      currentStreak: user.progression?.currentStreak ?? 0,
      longestStreak: user.progression?.longestStreak ?? 0,
      cefrUnlocked: user.progression?.cefrUnlocked ?? false,
      estimatedCefrLevel: user.progression?.estimatedCefrLevel ?? null,
      estimatedCefrConfidence: user.progression?.estimatedCefrConfidence ?? null,
      order: orderEntry
        ? {
            key: orderEntry.key,
            name: orderEntry.name,
            symbol: orderEntry.symbol,
            colour: orderEntry.colour,
            banner: orderEntry.banner,
          }
        : null,
      achievements: unlocks.map((u: { achievementId: string; unlockedAt: Date }) => {
        const entry = ACHIEVEMENT_CATALOG.find((a) => a.id === u.achievementId);
        return {
          id: u.achievementId,
          name: entry?.name ?? u.achievementId,
          category: entry?.category ?? null,
          unlockedAt: u.unlockedAt,
        };
      }),
      bossBattleHistory: battleHistory.map(
        (p: {
          finalRank: number | null;
          isWinner: boolean;
          battleXp: number;
          group: { battle: { weekId: string } };
        }) => ({
          weekId: p.group.battle.weekId,
          placement: p.finalRank!,
          isWinner: p.isWinner,
          battleXp: p.battleXp,
        }),
      ),
      memberSince: user.createdAt,
      showcasedCards: showcasedCards.map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category,
        rarity: c.rarity,
        artwork: c.artwork,
        journeyStageKey: c.journeyStageKey,
      })),
    };
  }
}
