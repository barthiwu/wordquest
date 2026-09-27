/**
 * One-off operator script (2026-09, US/UK spelling-variant feature): the
 * CSV importer (prisma/lib/csv-word-import.ts) now computes
 * wordUS/normalizedWordUS/exampleSentenceUS for every row it writes, but
 * that only covers rows created or UPDATED from here on. Every word
 * already sitting in a database from before this change (Barth's local
 * dev DB, and whatever partial state Railway's production DB is in from
 * the in-progress seed run) has all three columns null regardless of
 * whether a real US spelling actually exists for it. This script visits
 * every existing Word row and fills them in, using the exact same
 * usVariantFields() the importer itself uses (see its export comment) --
 * never a second copy of the conversion logic.
 *
 * Safe to re-run any time (e.g. after english-variant.ts's dictionary
 * gains new entries later) -- it always recomputes from the row's own
 * `word`/`exampleSentence`, which never change here, so re-running just
 * refreshes stale values rather than duplicating anything.
 *
 * Usage:
 *
 *   npx ts-node prisma/backfill-english-variant.ts
 *
 * Deliberately NOT wired into `npx prisma db seed` (prisma/seed.ts) --
 * seeding stays about inserting/updating the shipped word list itself;
 * this is a separate, explicit migration-of-existing-data step so it's
 * obvious from the command run which one Barth is doing. Run it once
 * per database (local dev, then again against Railway once the
 * in-progress production seed finishes) after pulling this change.
 */
import { PrismaClient } from '@prisma/client';
import { usVariantFields } from './lib/csv-word-import';

const prisma = new PrismaClient();
const BATCH_SIZE = 200;

async function main() {
  let processed = 0;
  let changed = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.word.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        word: true,
        exampleSentence: true,
        wordUS: true,
        exampleSentenceUS: true,
      },
    });

    if (batch.length === 0) break;

    for (const row of batch) {
      const fields = usVariantFields(row.word, row.exampleSentence);
      const isUnchanged =
        fields.wordUS === row.wordUS && fields.exampleSentenceUS === row.exampleSentenceUS;
      processed++;
      if (isUnchanged) continue;
      await prisma.word.update({ where: { id: row.id }, data: fields });
      changed++;
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < BATCH_SIZE) break;
  }

  // eslint-disable-next-line no-console
  console.log(`Backfilled US spelling variants: ${processed} word(s) checked, ${changed} updated.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
