import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';
import { parseWordRecords, WordImportRow, WordImportError } from '../../src/content/word-import';

export interface CsvImportSummary {
  created: number;
  updated: number;
  errors: WordImportError[];
}

/**
 * Content pipeline shared core (Vocabulary Vault §2/§12). Reads a CSV of
 * words, validates every row through parseWordRecords — the single
 * unit-tested source of truth for what makes a row importable — and
 * upserts the valid ones by `word`. A bad row is reported and skipped,
 * never allowed to abort the rest of the file (spec: one typo shouldn't
 * block importing the other 499 words).
 *
 * This is the one place both the automatic seed (prisma/seed.ts, for the
 * shipped 2000-word production CSV) and the manual operator import script
 * (prisma/import-words.ts, for any future CSV a content editor drops in)
 * actually write to the database — a fix, a new column, or a changed
 * upsert rule only has to happen here once.
 */
export async function importWordsFromCsv(
  prisma: PrismaClient,
  path: string,
): Promise<CsvImportSummary> {
  const csvText = readFileSync(path, 'utf-8');
  const records: Record<string, string>[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const { rows, errors } = parseWordRecords(records);

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const data = toWordData(row);
    // Match case-insensitively (V20 Vocabulary Vault §1 dedup fix): the old
    // exact-case `word` lookup let "Ambitious" (legacy CSV) and "ambitious"
    // (Vocabulary Vault V2 batch) both pass as "new" and create two rows
    // for the same word. normalizedWord is unique at the DB level too (see
    // migration 20260823195918_words_normalized_word_unique) as a backstop
    // against any other write path.
    const existing = await prisma.word.findFirst({
      where: { normalizedWord: row.word.toLowerCase() },
    });
    if (existing) {
      await prisma.word.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.word.create({ data });
      created++;
    }
  }

  return { created, updated, errors };
}

function toWordData(row: WordImportRow) {
  return {
    ...row,
    // vocabulary-production.csv's partOfSpeech is Title Case ("Noun",
    // "Verb"); a future hand-edited or operator-supplied CSV may still
    // use lowercase ("noun") — normalize here so the column stays
    // consistent in the DB no matter which casing convention the source
    // file used.
    partOfSpeech: row.partOfSpeech.toLowerCase(),
    normalizedWord: row.word.toLowerCase(),
    length: row.word.length,
    synonyms: row.synonyms ?? [],
    antonyms: row.antonyms ?? [],
    relatedWords: row.relatedWords ?? [],
    wordFamily: row.wordFamily ?? [],
  };
}
