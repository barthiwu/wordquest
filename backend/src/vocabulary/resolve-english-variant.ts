import { PrismaService } from '../prisma/prisma.service';

/**
 * Looks up one player's englishVariant preference (2026-09 fairness
 * feature -- see User.englishVariant's doc comment in schema.prisma
 * and english-variant.ts's renderWord). Centralized here rather than
 * inlined as `prisma.user.findUnique(...)` at every arcade/quest call
 * site so there's exactly one place to change if this preference ever
 * moves (e.g. gets cached, or gains a per-request override) -- and so
 * every surface treats a missing preference the same way (see below).
 *
 * Returns null for "no preference recorded" (never asked, or skipped
 * the signup step) rather than defaulting to 'UK' itself -- renderWord
 * already treats null/undefined the same as 'UK', so the fallback
 * decision lives in exactly one place (renderWord), not duplicated
 * here too.
 */
export async function resolveEnglishVariant(
  prisma: PrismaService,
  userId: string,
): Promise<'US' | 'UK' | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { englishVariant: true },
  });
  return user?.englishVariant ?? null;
}
