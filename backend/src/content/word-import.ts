export type WordDifficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface WordImportRow {
  word: string;
  definition: string;
  partOfSpeech: string;
  exampleSentence: string;
  baseDifficulty: WordDifficulty;
  cefrLevel?: string;
  category?: string;
  difficultyScore?: number;
  frequencyLevel?: string;
  usageNotes?: string;
  synonyms?: string[];
  antonyms?: string[];
  relatedWords?: string[];
  wordFamily?: string[];
  pronunciation?: string;
  phoneticRepresentation?: string;
  audioUrl?: string;
}

export interface WordImportError {
  /** 1-based CSV line number (header is line 1) — matches what a spreadsheet app shows. */
  line: number;
  reason: string;
}

export interface WordImportParseResult {
  rows: WordImportRow[];
  errors: WordImportError[];
}

/** Vocabulary Engine spec §2: minimum word length. */
export const MIN_WORD_LENGTH = 7;

const VALID_DIFFICULTIES = new Set<WordDifficulty>(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
// baseDifficulty is no longer a hard-required *column* — a file may omit it
// entirely and supply cefrLevel and/or difficultyScore instead (see
// deriveBaseDifficulty below). It only becomes a real per-row error when
// none of the three are resolvable for that row (checked inline, not here).
const REQUIRED_COLUMNS = ['word', 'definition', 'partOfSpeech', 'exampleSentence'];
const DERIVABLE_FROM_COLUMNS = ['baseDifficulty', 'cefrLevel', 'difficultyScore'];

/**
 * Vocabulary Vault V2 batches (Correction & Completion Spec §5) ship a
 * different, spreadsheet-friendly CSV shape than the original pipeline
 * expected: Title Case headers with spaces ("Part of Speech", "Example
 * Sentence"), a bare numeric ID column that isn't part of the Word model
 * at all, two separate Synonym columns instead of one ";"-joined cell,
 * and two new metadata columns (Frequency Level, Word Family) that don't
 * exist in the old format. Rather than hand-converting every future batch
 * to the old header shape, this maps known V2 headers onto the same
 * canonical field names the rest of this file already validates — the
 * original camelCase shape (every existing test fixture, and the legacy
 * half of prisma/vocabulary-production.csv before the V21 merge) already
 * uses the canonical names directly, so it passes through unchanged (the
 * alias table is the identity for those keys too).
 */
const HEADER_ALIASES: Record<string, string> = {
  id: '__id',
  word: 'word',
  definition: 'definition',
  partofspeech: 'partOfSpeech',
  examplesentence: 'exampleSentence',
  basedifficulty: 'baseDifficulty',
  cefrlevel: 'cefrLevel',
  category: 'category',
  difficultyscore: 'difficultyScore',
  frequencylevel: 'frequencyLevel',
  usagenote: 'usageNotes',
  usagenotes: 'usageNotes',
  synonyms: 'synonyms',
  synonym1: '__synonym1',
  synonym2: '__synonym2',
  antonyms: 'antonyms',
  relatedwords: 'relatedWords',
  wordfamily: '__wordFamily',
  pronunciation: 'pronunciation',
  phoneticrepresentation: 'phoneticRepresentation',
  audiourl: 'audioUrl',
};

function aliasKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Maps one raw CSV-parsed record (whatever header spelling the file used)
 * onto the canonical field names parseWordRecords validates against.
 * Unrecognized headers pass through untouched (so a genuinely new column
 * doesn't silently vanish — it just won't be read by anything below).
 */
export function normalizeImportRecord(record: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  let synonym1 = '';
  let synonym2 = '';
  let wordFamilyRaw = '';

  for (const [rawKey, value] of Object.entries(record)) {
    const mapped = HEADER_ALIASES[aliasKey(rawKey)];
    if (mapped === '__ignore') continue;
    if (mapped === '__id') {
      // The CSV `ID` column is never persisted (Word.id is a DB-generated
      // UUID — see toWordData), but a duplicate ID within one batch still
      // signals a real authoring mistake in the source spreadsheet (V20
      // Vocabulary Vault §1: "duplicate IDs"), so it's carried through
      // under a reserved key parseWordRecords checks and then drops.
      normalized.__csvId = value ?? '';
      continue;
    }
    if (mapped === '__synonym1') {
      synonym1 = value ?? '';
      continue;
    }
    if (mapped === '__synonym2') {
      synonym2 = value ?? '';
      continue;
    }
    if (mapped === '__wordFamily') {
      wordFamilyRaw = value ?? '';
      continue;
    }
    normalized[mapped ?? rawKey] = value;
  }

  if ((synonym1.trim() || synonym2.trim()) && !normalized.synonyms) {
    normalized.synonyms = [synonym1, synonym2]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(';');
  }
  // "Word Family" cells use ", " (comma) as their internal separator, since
  // that column comes from a different source convention than the rest of
  // this pipeline's ";"-joined multi-value cells — re-join with ";" so
  // splitList() below handles it the same way as every other list field.
  if (wordFamilyRaw.trim() && !normalized.wordFamily) {
    normalized.wordFamily = wordFamilyRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .join(';');
  }

  return normalized;
}

const CEFR_TO_DIFFICULTY: Record<string, WordDifficulty> = {
  A1: 'BEGINNER',
  A2: 'BEGINNER',
  B1: 'INTERMEDIATE',
  B2: 'INTERMEDIATE',
  C1: 'ADVANCED',
  C2: 'ADVANCED',
};

/** V20 Vocabulary Vault §1: "invalid CEFR values". */
const VALID_CEFR = new Set(Object.keys(CEFR_TO_DIFFICULTY));

/**
 * V20 Vocabulary Vault §1: "invalid categories". This is the full set in
 * use across prisma/vocabulary-production.csv (the merged 2000-word
 * production source, V21) plus "Nature" — used by the WordNet lexname
 * mapping the legacy-word metadata backfill relies on
 * (noun.animal/noun.plant/verb.weather) but not yet landed on any current
 * row. There's no other canonical source for this list in the codebase
 * (mobile/web don't hardcode a category enum) — this is it.
 */
const VALID_CATEGORIES = new Set([
  'Academic',
  'Arts & Creativity',
  'Business',
  'Communication',
  'Emotion',
  'General',
  'Health & Wellness',
  'Nature',
  'Personal Development',
  'Science & Technology',
  'Society & Culture',
  'Travel & Places',
]);

/**
 * V2 batches don't carry baseDifficulty directly — derive the coarse tier
 * from cefrLevel first (CEFR is already a standard proficiency scale, the
 * more principled source), falling back to bucketing the fine-grained
 * difficultyScore only when no CEFR level is given either. Returns
 * undefined when neither source is present/parseable, which the caller
 * turns into a normal per-row validation error.
 */
function deriveBaseDifficulty(
  rawBaseDifficulty: string | undefined,
  rawCefrLevel: string | undefined,
  rawDifficultyScore: string | undefined,
): WordDifficulty | undefined {
  const direct = (rawBaseDifficulty ?? '').trim().toUpperCase() as WordDifficulty;
  if (VALID_DIFFICULTIES.has(direct)) return direct;

  const cefr = (rawCefrLevel ?? '').trim().toUpperCase();
  if (CEFR_TO_DIFFICULTY[cefr]) return CEFR_TO_DIFFICULTY[cefr];

  const trimmedScore = (rawDifficultyScore ?? '').trim();
  const score = Number(trimmedScore);
  if (trimmedScore !== '' && Number.isFinite(score) && score >= 0 && score <= 100) {
    if (score < 34) return 'BEGINNER';
    if (score < 67) return 'INTERMEDIATE';
    return 'ADVANCED';
  }

  return undefined;
}

/**
 * Validates already-CSV-parsed records (one plain object per row, keyed
 * by header name) into WordImportRows. Deliberately takes parsed records
 * rather than raw CSV text, so this — the part worth testing carefully —
 * has no dependency on which CSV library reads the file.
 *
 * A bad row is skipped with a reason, not a thrown exception — one typo
 * in a 200-word spreadsheet shouldn't block importing the other 199.
 */
export function parseWordRecords(rawRecords: Record<string, string>[]): WordImportParseResult {
  const errors: WordImportError[] = [];

  if (rawRecords.length === 0) {
    return { rows: [], errors: [{ line: 1, reason: 'CSV has no data rows' }] };
  }

  const records = rawRecords.map(normalizeImportRecord);

  const headers = Object.keys(records[0]);
  const missingColumns = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (!DERIVABLE_FROM_COLUMNS.some((col) => headers.includes(col))) {
    missingColumns.push('baseDifficulty');
  }
  if (missingColumns.length > 0) {
    return {
      rows: [],
      errors: [{ line: 1, reason: `Missing required column(s): ${missingColumns.join(', ')}` }],
    };
  }

  const rows: WordImportRow[] = [];
  const seenWords = new Set<string>();
  const seenIds = new Set<string>();

  records.forEach((record, i) => {
    const line = i + 2; // header is line 1, first data row is line 2

    const csvId = (record.__csvId ?? '').trim();
    if (csvId) {
      if (seenIds.has(csvId)) {
        errors.push({ line, reason: `duplicate ID "${csvId}" within this file` });
        return;
      }
      seenIds.add(csvId);
    }

    const word = (record.word ?? '').trim();
    const definition = (record.definition ?? '').trim();
    const partOfSpeech = (record.partOfSpeech ?? '').trim();
    const exampleSentence = (record.exampleSentence ?? '').trim();
    const baseDifficulty = deriveBaseDifficulty(
      record.baseDifficulty,
      record.cefrLevel,
      record.difficultyScore,
    );

    if (!word) {
      errors.push({ line, reason: 'Missing word' });
      return;
    }
    if (word.length < MIN_WORD_LENGTH) {
      errors.push({
        line,
        reason: `"${word}" is only ${word.length} letters — minimum is ${MIN_WORD_LENGTH}`,
      });
      return;
    }
    if (!definition) {
      errors.push({ line, reason: `"${word}": missing definition` });
      return;
    }
    if (!partOfSpeech) {
      errors.push({ line, reason: `"${word}": missing partOfSpeech` });
      return;
    }
    if (!exampleSentence) {
      errors.push({ line, reason: `"${word}": missing exampleSentence` });
      return;
    }
    if (!baseDifficulty) {
      errors.push({
        line,
        reason: `"${word}": baseDifficulty must be BEGINNER, INTERMEDIATE, or ADVANCED (got "${record.baseDifficulty ?? ''}"), and no valid cefrLevel or difficultyScore was given to derive it from`,
      });
      return;
    }

    const normalizedWord = word.toLowerCase();
    if (seenWords.has(normalizedWord)) {
      errors.push({ line, reason: `"${word}": duplicate word within this file` });
      return;
    }

    const rawCefr = record.cefrLevel?.trim().toUpperCase();
    if (rawCefr && !VALID_CEFR.has(rawCefr)) {
      errors.push({
        line,
        reason: `"${word}": invalid cefrLevel "${record.cefrLevel}" — must be one of ${[...VALID_CEFR].join(', ')}`,
      });
      return;
    }

    const rawCategory = record.category?.trim();
    if (rawCategory && !VALID_CATEGORIES.has(rawCategory)) {
      errors.push({
        line,
        reason: `"${word}": invalid category "${rawCategory}" — must be one of ${[...VALID_CATEGORIES].join(', ')}`,
      });
      return;
    }

    let difficultyScore: number | undefined;
    const rawScore = record.difficultyScore?.trim();
    if (rawScore) {
      const parsed = Number(rawScore);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        errors.push({
          line,
          reason: `"${word}": difficultyScore must be a number between 0 and 100 (got "${rawScore}")`,
        });
        return;
      }
      difficultyScore = parsed;
    }

    const synonyms = splitList(record.synonyms);
    if (!synonyms || synonyms.length === 0) {
      errors.push({
        line,
        reason: `"${word}": missing synonyms — at least one synonym is required`,
      });
      return;
    }

    seenWords.add(normalizedWord);

    rows.push({
      word,
      definition,
      partOfSpeech,
      exampleSentence,
      baseDifficulty,
      cefrLevel: rawCefr || undefined,
      category: record.category?.trim() || undefined,
      difficultyScore,
      frequencyLevel: record.frequencyLevel?.trim() || undefined,
      usageNotes: record.usageNotes?.trim() || undefined,
      synonyms,
      antonyms: splitList(record.antonyms),
      relatedWords: splitList(record.relatedWords),
      wordFamily: splitList(record.wordFamily),
      pronunciation: record.pronunciation?.trim() || undefined,
      phoneticRepresentation: record.phoneticRepresentation?.trim() || undefined,
      audioUrl: record.audioUrl?.trim() || undefined,
    });
  });

  return { rows, errors };
}

/** synonyms/relatedWords use ";" as the sub-list separator within one CSV cell, since "," is already the field delimiter. */
function splitList(value: string | undefined): string[] | undefined {
  if (!value?.trim()) return undefined;
  const items = value
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}
