import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../common/prisma-errors';

export type CacheCheckResult<T> = { cached: true; response: T } | { cached: false };

/**
 * Server-side idempotency (V1 Final Systems Spec §3.7: "mandatory").
 * Two-step, not a single interceptor, so the cache WRITE can happen
 * inside the same $transaction as the reward grant it's caching — a
 * crash between "reward granted" and "cache written" must never be
 * possible, or the whole point of this is defeated. A pure-interceptor
 * design (checking/writing entirely outside the service layer) can't
 * make that guarantee, since it has no access to the service's own
 * transaction.
 *
 * Usage: a controller calls checkCache() BEFORE calling its service —
 * on a hit, return the cached response directly, never touching the
 * service (so a retried request doesn't even re-run the real AI call
 * it's caching the result of). On a miss, call the service as normal;
 * the service itself calls recordInTransaction() from inside its own
 * $transaction, right before returning.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async checkCache<T>(
    userId: string,
    key: string | undefined,
    endpoint: string,
  ): Promise<CacheCheckResult<T>> {
    if (!key) return { cached: false };

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { userId_key_endpoint: { userId, key, endpoint } },
    });

    return existing ? { cached: true, response: existing.responseBody as T } : { cached: false };
  }

  async recordInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    key: string | undefined,
    endpoint: string,
    response: unknown,
  ): Promise<void> {
    if (!key) return;

    try {
      await tx.idempotencyKey.create({
        data: { userId, key, endpoint, responseBody: response as any },
      });
    } catch (err) {
      // A concurrent duplicate request raced this one and inserted its
      // own record first — fine, this transaction's own result is still
      // correct and about to commit; there's nothing to recover from.
      if (!isUniqueConstraintError(err)) throw err;
    }
  }
}
