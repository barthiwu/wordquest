import type { PrismaService } from '../prisma/prisma.service';

/** The few session fields the per-word clock cares about. */
interface WordClockRow {
  id: string;
  currentIndex: number;
  currentWordPending: boolean;
  currentWordStartedAt: Date;
}

/**
 * Starts the current word's clock if it has not started yet.
 *
 * After an answer, an app that asks for deferral (`deferNext`) is not sent the
 * next word; the session is left "pending" and the clock is not running for
 * the player. When the player taps Continue the app calls /begin, which lands
 * here: the clock is set to now and the pending flag cleared, in one
 * compare-and-swap so a double tap or a network retry cannot restart it.
 * A relaunch that resumes a pending session goes through here too.
 *
 * Returns the row as it now stands. A session that is not pending is returned
 * untouched, so calling this is always safe.
 */
export async function beginPendingWord<T extends WordClockRow>(
  prisma: Pick<PrismaService, 'arcadeGameSession'>,
  session: T,
): Promise<T> {
  if (!session.currentWordPending) return session;
  const now = new Date();
  const { count } = await prisma.arcadeGameSession.updateMany({
    where: { id: session.id, currentIndex: session.currentIndex, currentWordPending: true },
    data: { currentWordPending: false, currentWordStartedAt: now },
  });
  if (count === 1) return { ...session, currentWordPending: false, currentWordStartedAt: now };
  // Someone else (a retry, a double tap) began it first: use their clock.
  const fresh = await prisma.arcadeGameSession.findUnique({ where: { id: session.id } });
  return (fresh as unknown as T | null) ?? session;
}
