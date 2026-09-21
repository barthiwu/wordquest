// One-off dev utility: your Sept 12 test session left a quest attempt
// stuck in IN_PROGRESS (never completed), and startTimedQuest always
// resumes an IN_PROGRESS attempt rather than starting fresh — that's why
// the same word kept coming back days later. This marks any IN_PROGRESS
// attempts ABANDONED so your next "start quest" call creates a new one.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.questAttempt.updateMany({
    where: { status: 'IN_PROGRESS' },
    data: { status: 'ABANDONED' },
  });
  console.log(`Abandoned ${result.count} stale in-progress quest attempt(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
