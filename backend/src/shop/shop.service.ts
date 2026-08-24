import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { isUniqueConstraintError } from '../common/prisma-errors';

export interface ShopItemView {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  priceGlyphs: number;
  owned: boolean;
}

export interface ShopPurchaseView {
  id: string;
  itemId: string;
  itemKey: string;
  itemName: string;
  priceGlyphs: number;
  purchasedAt: Date;
}

/**
 * The Glyph shop foundation (V1 Remaining Systems Spec §9) — a catalog of
 * cosmetic ALI outfits/accessories purchasable with Glyphs. Deliberately
 * thin: pricing/inventory/ownership only, no equip/wear state (that's an
 * ALI-presentation concern for a later pass, same as spec's own framing
 * of this as a "foundation").
 */
@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progression: ProgressionService,
  ) {}

  /** Active catalog, annotated with whether the player already owns each item. */
  async getCatalog(userId: string): Promise<ShopItemView[]> {
    const [items, purchases] = await Promise.all([
      this.prisma.shopItem.findMany({ where: { isActive: true }, orderBy: { priceGlyphs: 'asc' } }),
      this.prisma.shopPurchase.findMany({ where: { userId }, select: { itemId: true } }),
    ]);
    const ownedItemIds = new Set(purchases.map((p: { itemId: string }) => p.itemId));

    return items.map((item: (typeof items)[number]) => ({
      id: item.id,
      key: item.key,
      name: item.name,
      description: item.description,
      category: item.category,
      priceGlyphs: item.priceGlyphs,
      owned: ownedItemIds.has(item.id),
    }));
  }

  async getPurchaseHistory(userId: string): Promise<ShopPurchaseView[]> {
    const purchases = await this.prisma.shopPurchase.findMany({
      where: { userId },
      include: { item: { select: { key: true, name: true } } },
      orderBy: { purchasedAt: 'desc' },
    });

    return purchases.map((p: (typeof purchases)[number]) => ({
      id: p.id,
      itemId: p.itemId,
      itemKey: p.item.key,
      itemName: p.item.name,
      priceGlyphs: p.priceGlyphs,
      purchasedAt: p.purchasedAt,
    }));
  }

  /**
   * Spends Glyphs and records ownership — one purchase per item per
   * player. The upfront `alreadyOwned` check is just a fast/friendly
   * path; the real guard is `ShopPurchase`'s `@@unique([userId, itemId])`
   * constraint (Glyph Economy Hardening, V19 Stabilization Spec §9) —
   * two concurrent purchase() calls for the same item can both pass the
   * pre-check, but only one `shopPurchase.create` can commit. Because
   * that create lives in the SAME transaction as the Glyph debit, the
   * loser's whole transaction (debit included) rolls back automatically
   * on the constraint violation — no double-charge, just a clean 409 for
   * whichever request lost the race.
   */
  async purchase(userId: string, itemId: string): Promise<ShopPurchaseView> {
    const item = await this.prisma.shopItem.findUnique({ where: { id: itemId } });
    if (!item || !item.isActive) {
      throw new NotFoundException('Shop item not found');
    }

    const alreadyOwned = await this.prisma.shopPurchase.findFirst({
      where: { userId, itemId },
    });
    if (alreadyOwned) {
      throw new ConflictException('You already own this item');
    }

    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await this.progression.spendGlyphs(
          userId,
          item.priceGlyphs,
          'SHOP_PURCHASE',
          'shop',
          item.id,
          tx,
        );

        const purchase = await tx.shopPurchase.create({
          data: { userId, itemId: item.id, priceGlyphs: item.priceGlyphs },
        });

        return {
          id: purchase.id,
          itemId: item.id,
          itemKey: item.key,
          itemName: item.name,
          priceGlyphs: item.priceGlyphs,
          purchasedAt: purchase.purchasedAt,
        };
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'Insufficient Glyph balance') {
        throw new BadRequestException('Insufficient Glyph balance');
      }
      if (isUniqueConstraintError(err)) {
        throw new ConflictException('You already own this item');
      }
      throw err;
    }
  }
}
