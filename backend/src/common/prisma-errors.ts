/**
 * Structural check (err.code === 'P2002') rather than
 * `instanceof Prisma.PrismaClientKnownRequestError` — that class isn't
 * part of every Prisma client build surface (confirmed missing from
 * this sandbox's stub client), and the structural check works
 * regardless of which build is running.
 */
export function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}
