/**
 * Bulk word import from a CSV (spreadsheet export) — Content pipeline
 * (build order §47 item 12), for any word list beyond the production
 * 10,000-word set shipped with the app (prisma/vocabulary-production.csv,
 * imported automatically by `npx prisma db seed`, see prisma/seed.ts).
 * Usage:
 *
 *   npx ts-node prisma/import-words.ts path/to/words.csv
 *
 * Required columns: word, definition, partOfSpeech, exampleSentence, plus
 * one of baseDifficulty (BEGINNER | INTERMEDIATE | ADVANCED,
 * case-insensitive) / cefrLevel / difficultyScore — baseDifficulty is
 * derived from cefrLevel (or difficultyScore, as a fallback) when not
 * given directly. Optional: cefrLevel, category, difficultyScore,
 * frequencyLevel, usageNotes, synonyms, antonyms, relatedWords, wordFamily,
 * pronunciation, phoneticRepresentation, audioUrl.
 * synonyms/antonyms/relatedWords/wordFamily use ";" to separate multiple
 * values within one cell, since "," is already the CSV delimiter.
 *
 * Also accepts the Vocabulary Vault V2 batch header shape directly (ID,
 * Word, Definition, Part of Speech, Example Sentence, Synonym 1, Synonym
 * 2, CEFR Level, Difficulty Score, Category, Frequency Level, Word
 * Family, Usage Note) — see src/content/word-import.ts's
 * normalizeImportRecord for the full header-alias table.
 *
 * Upserts by `word` (exact match) — safe to re-run after editing the
 * same file; existing words get their other fields updated, not
 * duplicated. All validation lives in src/content/word-import.ts, and
 * the actual read/validate/upsert pipeline lives in
 * prisma/lib/csv-word-import.ts (both unit-tested/shared with the seed
 * script) — this file is just the CLI wrapper around it.
 */
import { PrismaClient } from '@prisma/client';
import { importWordsFromCsv } from './lib/csv-word-import';

const prisma = new PrismaClient();

async function main() {
  const path = process.argv[2];
  if (!path) {
    // eslint-disable-next-line no-console
    console.error('Usage: npx ts-node prisma/import-words.ts path/to/words.csv');
    process.exit(1);
  }

  const { created, updated, errors } = await importWordsFromCsv(prisma, path);

  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`${errors.length} row(s) skipped:`);
    for (const err of errors) {
      // eslint-disable-next-line no-console
      console.log(`  line ${err.line}: ${err.reason}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\nDone: ${created} created, ${updated} updated, ${errors.length} skipped.`);
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
