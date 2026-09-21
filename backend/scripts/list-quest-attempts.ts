import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const attempts = await prisma.questAttempt.findMany({
    orderBy: { startedAt: 'desc' },
    take: 10,
    include: { quest: { select: { key: true, title: true } } },
  });
  for (const a of attempts) {
    console.log(
      `id=${a.id} quest=${a.quest.key} status=${a.status} wordStage=${a.wordStage} currentIndex=${a.currentIndex}/${a.wordIds.length} guessStartedAt=${a.guessStartedAt?.toISOString()} startedAt=${a.startedAt.toISOString()}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
