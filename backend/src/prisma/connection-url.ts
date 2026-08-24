/**
 * Applies a floor to DATABASE_URL's `connection_limit` when the operator
 * hasn't set one explicitly (V22 §5/§15 stress testing finding). Without
 * it, Prisma sizes its pool from the container's CPU count
 * (`num_physical_cpus * 2 + 1`) — on a small production instance (1-2
 * vCPU) that can be as low as 3-5 connections, which a burst of
 * concurrent Boss Battle answer submissions (each opens its own
 * interactive transaction — see BossBattleService.submitAnswer's doc
 * comment) can exhaust, turning a temporary traffic burst into
 * "transaction already closed" errors instead of graceful queueing.
 *
 * This is a floor, not an override — an operator who has already sized
 * `connection_limit` deliberately (e.g. to stay under their Postgres
 * plan's max_connections) is left alone. It only protects deployments
 * that never set it at all, which is the common case (see
 * .env.example's DATABASE_URL guidance for how to size it properly).
 */
export const MINIMUM_CONNECTION_LIMIT = 10;

export function withConnectionLimitFloor(
  databaseUrl: string,
  minimum: number = MINIMUM_CONNECTION_LIMIT,
): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    // Malformed URL — not this function's job to validate it; leave it
    // untouched and let Prisma itself raise the real connection error.
    return databaseUrl;
  }

  const existing = url.searchParams.get('connection_limit');
  const existingValue = existing !== null ? Number(existing) : NaN;
  if (Number.isFinite(existingValue) && existingValue > 0) {
    return databaseUrl; // operator already made an explicit choice — respect it, even if lower than our floor
  }

  url.searchParams.set('connection_limit', String(minimum));
  return url.toString();
}
