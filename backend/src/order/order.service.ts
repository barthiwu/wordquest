import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hasReachedKingdomStage } from '../config/journey-stages';
import { AliService } from '../ali/ali.service';
import { ORDER_CATALOG, ORDER_CHANGE_COOLDOWN_MS, type OrderCatalogEntry } from './order-catalog';

export interface MyOrderView {
  current: OrderCatalogEntry['key'] | null;
  selectedAt: Date | null;
  changeEligibleAt: Date | null;
}

export interface OrderHistoryEntry {
  order: OrderCatalogEntry['key'];
  selectedAt: Date;
}

/**
 * The Order (Final Core Progression Spec §5) — a Kingdom-level identity
 * system with zero gameplay effect. selectOrder() only ever writes to
 * OrderSelection, so "changing Order never resets Level, Journey,
 * mastery, achievements, or any other progression system" (§5.4) is
 * true by construction, not something this service has to specially
 * guard — there's nothing else here it could touch.
 */
@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ali: AliService,
  ) {}

  listCatalog(): OrderCatalogEntry[] {
    return ORDER_CATALOG;
  }

  async getMyOrder(userId: string): Promise<MyOrderView> {
    const latest = await this.prisma.orderSelection.findFirst({
      where: { userId },
      orderBy: { selectedAt: 'desc' },
    });
    if (!latest) return { current: null, selectedAt: null, changeEligibleAt: null };

    return {
      current: latest.order,
      selectedAt: latest.selectedAt,
      changeEligibleAt: new Date(latest.selectedAt.getTime() + ORDER_CHANGE_COOLDOWN_MS),
    };
  }

  /** "Previous Orders are retained as private identity history" (§5.4) — this is that history, for the owner only. */
  async getMyOrderHistory(userId: string): Promise<OrderHistoryEntry[]> {
    const rows: { order: OrderCatalogEntry['key']; selectedAt: Date }[] =
      await this.prisma.orderSelection.findMany({
        where: { userId },
        orderBy: { selectedAt: 'desc' },
        select: { order: true, selectedAt: true },
      });
    return rows;
  }

  async selectOrder(userId: string, order: OrderCatalogEntry['key']): Promise<MyOrderView> {
    const progression = await this.prisma.userProgression.findUniqueOrThrow({ where: { userId } });
    if (!hasReachedKingdomStage(progression.journeyStage)) {
      throw new ForbiddenException('The Order unlocks once you reach Kingdom.');
    }

    const latest = await this.prisma.orderSelection.findFirst({
      where: { userId },
      orderBy: { selectedAt: 'desc' },
    });

    if (latest) {
      const changeEligibleAt = new Date(latest.selectedAt.getTime() + ORDER_CHANGE_COOLDOWN_MS);
      if (new Date() < changeEligibleAt) {
        throw new BadRequestException(
          `You can change your Order again on ${changeEligibleAt.toISOString()}.`,
        );
      }
      if (latest.order === order) {
        throw new BadRequestException('You are already in this Order.');
      }
    }

    const created = await this.prisma.orderSelection.create({ data: { userId, order } });

    const catalogEntry = ORDER_CATALOG.find((o) => o.key === order);
    this.ali.reactFireAndForget(userId, {
      type: 'ORDER_SELECTION',
      journeyStage: progression.journeyStage,
      context: { orderName: catalogEntry?.name, isFirstSelection: !latest },
    });

    return {
      current: created.order,
      selectedAt: created.selectedAt,
      changeEligibleAt: new Date(created.selectedAt.getTime() + ORDER_CHANGE_COOLDOWN_MS),
    };
  }
}
