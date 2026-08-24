import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestCardRarity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../common/prisma-errors';

type Db = PrismaService | Prisma.TransactionClient;
export type QuestCardSource = 'JOURNEY_COMPLETION' | 'BOSS_BATTLE_WIN' | 'ACHIEVEMENT';

/** Profile showcase cap (V19 Stabilization Spec §8: "Profile showcase. Selection system.") — a curated highlight reel, not a second copy of the full gallery. */
export const MAX_SHOWCASE_CARDS = 5;

export interface CreateCardOptions {
  artwork?: string;
  rarity?: QuestCardRarity;
  journeyStageKey?: string;
}

export interface QuestCardView {
  id: string;
  source: QuestCardSource;
  sourceEventId: string;
  title: string;
  category: string | null;
  playerDisplayNameSnapshot: string;
  artwork: string | null;
  rarity: QuestCardRarity;
  journeyStageKey: string | null;
  earnedAt: Date;
  isShowcased: boolean;
  showcaseOrder: number | null;
}

/**
 * "Permanent identity collectibles" (Final Core Progression Spec §6.7).
 * A standalone service rather than living inside Progression,
 * Achievement, or BossBattle — all three need to create cards, and
 * none of them should depend on each other just to do it.
 */
@Injectable()
export class QuestCardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent by (userId, source, sourceEventId) — enforced by the
   * quest_cards unique index (Correction & Completion Spec §6: "add
   * duplicate protection", "ensure unique achievement generation"). A
   * caller re-triggering the same source event (a race between two
   * finalization attempts, a retried request, achievement.service's own
   * unlock() winning a race by a hair before this call lands twice)
   * silently no-ops on the second call instead of minting a duplicate
   * "permanent identity collectible" — the whole point of a Quest Card
   * is that it's earned exactly once per event, so a second copy would
   * be a real correctness bug, not just clutter.
   */
  async createCard(
    userId: string,
    source: QuestCardSource,
    sourceEventId: string,
    title: string,
    category: string | undefined,
    db: Db = this.prisma,
    opts: CreateCardOptions = {},
  ): Promise<void> {
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true },
    });
    try {
      await db.questCard.create({
        data: {
          userId,
          source,
          sourceEventId,
          title,
          category,
          // Snapshotted now, not live-joined later — a display-name
          // change after this card is earned must not rewrite its history.
          playerDisplayNameSnapshot: user.displayName,
          ...(opts.artwork ? { artwork: opts.artwork } : {}),
          ...(opts.rarity ? { rarity: opts.rarity } : {}),
          ...(opts.journeyStageKey ? { journeyStageKey: opts.journeyStageKey } : {}),
        },
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) return;
      throw err;
    }
  }

  /** Every card the player has ever earned — their permanent collectible gallery. */
  async listMyCards(userId: string): Promise<QuestCardView[]> {
    return this.prisma.questCard.findMany({
      where: { userId },
      orderBy: { earnedAt: 'desc' },
    });
  }

  /** One card's full detail — used for both the gallery detail view and the shareable view. Owner-only: a card is "permanent identity," not a public link. */
  async getCard(userId: string, cardId: string): Promise<QuestCardView> {
    const card = await this.prisma.questCard.findUnique({ where: { id: cardId } });
    if (!card) throw new NotFoundException('Quest Card not found');
    if (card.userId !== userId) throw new ForbiddenException('Not your Quest Card');
    return card;
  }

  /** Just the player's current showcase, in display order — what a profile view renders. */
  async listShowcase(userId: string): Promise<QuestCardView[]> {
    return this.prisma.questCard.findMany({
      where: { userId, isShowcased: true },
      orderBy: { showcaseOrder: 'asc' },
    });
  }

  /**
   * Quest Cards Finalization (V19 Stabilization Spec §8: "Profile
   * showcase. Selection system.") — the player picks up to
   * MAX_SHOWCASE_CARDS of their own cards, in the order given, to
   * feature on their profile. Replaces the whole showcase set on every
   * call (not additive) — an empty array is a valid way to clear it.
   * Ownership is re-checked here even though `createCard` already scoped
   * every card to its earner, because this endpoint takes arbitrary
   * client-supplied ids and must not let a player showcase (or,
   * incidentally, discover the existence of) another player's card.
   */
  async setShowcase(userId: string, cardIds: string[]): Promise<QuestCardView[]> {
    const uniqueIds = Array.from(new Set(cardIds));
    if (uniqueIds.length > MAX_SHOWCASE_CARDS) {
      throw new BadRequestException(`You can showcase at most ${MAX_SHOWCASE_CARDS} cards.`);
    }

    if (uniqueIds.length > 0) {
      const owned = await this.prisma.questCard.count({
        where: { id: { in: uniqueIds }, userId },
      });
      if (owned !== uniqueIds.length) {
        throw new ForbiddenException('One or more cards are not yours');
      }
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Clear anything previously showcased that isn't in the new set —
      // this is a full replace, not an additive toggle.
      await tx.questCard.updateMany({
        where: { userId, isShowcased: true, id: { notIn: uniqueIds } },
        data: { isShowcased: false, showcaseOrder: null },
      });
      for (let i = 0; i < uniqueIds.length; i++) {
        await tx.questCard.update({
          where: { id: uniqueIds[i] },
          data: { isShowcased: true, showcaseOrder: i + 1 },
        });
      }
    });

    return this.listShowcase(userId);
  }
}
