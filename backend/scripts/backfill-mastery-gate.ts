// One-off backfill: the MASTERED gate changed (Sept 2026 — Correction &
// Completion Spec amendment) from "guessScore >= 75" to a one-time
// "has this word's Guess ever been answered right" pass. Any word whose
// Mastery row already satisfies the NEW gate — guessed correctly at
// least once, sentenceScore and paragraphScore both >= threshold — but
// was evaluated under the OLD one and never touched again isn't
// promoted automatically; the gate is only re-checked on a live
// interaction (recordAnswer / evaluateWordCycleCompletion /
// recordSkillAreaPractice). This finds every such word across every
// player and promotes it, going through MasteryService.recheckGate so
// it gets the exact same side effects a live promotion would:
// masteredWordsCount, Journey/CEFR eligibility, achievements, the ALI
// reaction — nothing here duplicates that logic by hand.
//
// Run once with: npx ts-node scripts/backfill-mastery-gate.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MasteryService } from '../src/mastery/mastery.service';
import { gameplayRules } from '../src/config/gameplay-rules';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const prisma = app.get(PrismaService);
    const mastery = app.get(MasteryService);
    const { skillAreaMasteryThresholdPercent } = gameplayRules.mastery;

    // Pre-filter to the rows that could possibly qualify — recheckGate
    // re-validates every one of them itself, this just keeps the scan
    // small rather than re-deriving the gate for the whole table.
    const candidates = await prisma.mastery.findMany({
      where: {
        currentLevel: { not: 'MASTERED' },
        timesCorrect: { gt: 0 },
        sentenceScore: { gte: skillAreaMasteryThresholdPercent },
        paragraphScore: { gte: skillAreaMasteryThresholdPercent },
      },
      select: { userId: true, wordId: true },
    });

    console.log(`Found ${candidates.length} word(s) to re-check.`);

    let promoted = 0;
    for (const { userId, wordId } of candidates) {
      const { justMastered } = await mastery.recheckGate(userId, wordId);
      if (justMastered) promoted += 1;
    }

    console.log(`Promoted ${promoted} word(s) to MASTERED.`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
