import type { PrismaService } from '../prisma/prisma.service';

/**
 * The word a player is being asked to guess RIGHT NOW in each of their open
 * Daily Quest attempts. Such a word's spelling must never be readable from
 * any other endpoint (word lookup, search, mastery list), or a player could
 * just look the answer up while the question is still open. Once the attempt
 * moves on or ends, the word is no longer secret and these filters drop away.
 */
export async function currentQuestWordIds(
  prisma: Pick<PrismaService, 'questAttempt'>,
  userId: string,
): Promise<string[]> {
  const open = await prisma.questAttempt.findMany({
    where: { userId, status: 'IN_PROGRESS' },
    select: { wordIds: true, currentIndex: true },
  });
  return open
    .map((a) => a.wordIds[a.currentIndex])
    .filter((id): id is string => typeof id === 'string');
}
