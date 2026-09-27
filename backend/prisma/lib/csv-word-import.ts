import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';
import { parseWordRecords, WordImportRow, WordImportError } from '../../src/content/word-import';
import {
  toUsSpelling,
  toUsNormalizedWord,
  toUsSentence,
} from '../../src/vocabulary/english-variant';

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
 * shipped 10,000-word production CSV) and the manual operator import script
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
    const existing = await withTransientRetry(() =>
      prisma.word.findFirst({ where: { normalizedWord: row.word.toLowerCase() } }),
    );
    if (existing) {
      await withTransientRetry(() => prisma.word.update({ where: { id: existing.id }, data }));
      updated++;
    } else {
      await withTransientRetry(() => prisma.word.create({ data }));
      created++;
    }
  }

  return { created, updated, errors };
}

/** Prisma error codes worth retrying: transient connection drops, not
 * data problems -- a bad row's real errors (unique constraint, bad
 * enum value, etc.) should still fail immediately, not retry-and-mask. */
const TRANSIENT_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);

/**
 * A ~10,000-row seed/import does two sequential round trips per row (a
 * lookup, then a create or update) -- against a database reached over
 * a public proxy (e.g. Railway's public Postgres endpoint, rather than
 * its private network), a run this long is likely to hit at least one
 * transient connection drop partway through. Retrying a handful of
 * times with backoff turns "the whole import dies at row 6,412" into
 * "one row pauses for a couple seconds and continues" -- without
 * masking a genuine data error, which fails on the first try same as
 * before.
 */
async function withTransientRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const code = (err as { code?: string })?.code;
      if (attempt >= maxAttempts || !code || !TRANSIENT_PRISMA_CODES.has(code)) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
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
    // US-spelling variant (2026-09 fairness feature -- see
    // vocabulary/english-variant.ts's doc comment and Word.wordUS's own
    // doc comment in schema.prisma). Derived here, at import time, from
    // the CSV's UK-authored `word`/`exampleSentence` -- never hand-
    // authored per row. wordUS/normalizedWordUS and exampleSentenceUS
    // are nulled INDEPENDENTLY of each other, not as a pair: a headword
    // with no US spelling of its own (e.g. "Adventure") can still sit
    // in a sentence that mentions a word that DOES have one (e.g.
    // "...its favourite..."), and that sentence should still convert
    // for a US-preference player even though the headword itself never
    // changes. Both stay null only when there's genuinely nothing to
    // convert on that side -- true for most rows on both counts.
    ...usVariantFields(row.word, row.exampleSentence),
  };
}

// Exported so prisma/backfill-english-variant.ts can recompute these
// three columns for rows imported before this feature existed, using
// the exact same conversion logic the CSV importer uses for new/
// updated rows -- never a second, drifting copy of it.
export function usVariantFields(word: string, exampleSentence: string) {
  const wordUS = toUsSpelling(word);
  const sentenceUS = toUsSentence(exampleSentence);
  return {
    wordUS,
    normalizedWordUS: toUsNormalizedWord(word),
    exampleSentenceUS: sentenceUS === exampleSentence ? null : sentenceUS,
  };
}
