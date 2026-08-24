import { MIN_WORD_LENGTH, normalizeImportRecord, parseWordRecords } from './word-import';

const validRecord = {
  word: 'Adventure',
  definition: 'An exciting or unusual experience.',
  partOfSpeech: 'noun',
  exampleSentence: 'They set off on an adventure.',
  baseDifficulty: 'BEGINNER',
  synonyms: 'escapade',
};

describe('parseWordRecords', () => {
  it('parses a fully valid row', () => {
    const result = parseWordRecords([validRecord]);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toEqual([
      {
        word: 'Adventure',
        definition: 'An exciting or unusual experience.',
        partOfSpeech: 'noun',
        exampleSentence: 'They set off on an adventure.',
        baseDifficulty: 'BEGINNER',
        cefrLevel: undefined,
        synonyms: ['escapade'],
        relatedWords: undefined,
        pronunciation: undefined,
        audioUrl: undefined,
      },
    ]);
  });

  it('reports a single error when the CSV has no data rows', () => {
    const result = parseWordRecords([]);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual([{ line: 1, reason: 'CSV has no data rows' }]);
  });

  it('reports missing required columns once, without processing rows', () => {
    const result = parseWordRecords([{ word: 'Adventure', definition: 'x' }]);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain('partOfSpeech');
    expect(result.errors[0].reason).toContain('exampleSentence');
    expect(result.errors[0].reason).toContain('baseDifficulty');
  });

  it('rejects a word shorter than the 7-letter minimum (spec §2), continuing past it', () => {
    const result = parseWordRecords([
      { ...validRecord, word: 'cat' },
      { ...validRecord, word: 'Beautiful' },
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].word).toBe('Beautiful');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toEqual({ line: 2, reason: '"cat" is only 3 letters — minimum is 7' });
  });

  it(`accepts a word exactly at the ${MIN_WORD_LENGTH}-letter minimum`, () => {
    const sevenLetters = 'thought';
    expect(sevenLetters).toHaveLength(MIN_WORD_LENGTH);
    const result = parseWordRecords([{ ...validRecord, word: sevenLetters }]);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].word).toBe(sevenLetters);
  });

  it.each(['definition', 'partOfSpeech', 'exampleSentence'])(
    'rejects a row missing %s',
    (field) => {
      const record = { ...validRecord, [field]: '' };
      const result = parseWordRecords([record]);
      expect(result.rows).toHaveLength(0);
      expect(result.errors[0].reason).toContain(field);
    },
  );

  it('rejects a row with no synonyms at all (V21 Vocabulary Vault Final Production Pass §1)', () => {
    const result = parseWordRecords([{ ...validRecord, synonyms: '' }]);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain('missing synonyms');
  });

  it('rejects an invalid baseDifficulty value', () => {
    const result = parseWordRecords([{ ...validRecord, baseDifficulty: 'EXPERT' }]);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0].reason).toContain('EXPERT');
  });

  it('normalizes baseDifficulty case (e.g. "beginner" -> "BEGINNER")', () => {
    const result = parseWordRecords([{ ...validRecord, baseDifficulty: 'beginner' }]);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].baseDifficulty).toBe('BEGINNER');
  });

  it('rejects a duplicate word within the same file, case-insensitively', () => {
    const result = parseWordRecords([validRecord, { ...validRecord, word: 'ADVENTURE' }]);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain('duplicate');
  });

  it('reports the correct 1-based CSV line number for each row (header is line 1)', () => {
    const result = parseWordRecords([
      { ...validRecord, word: 'cat' },
      { ...validRecord, word: 'dog' },
    ]);
    expect(result.errors[0].line).toBe(2);
    expect(result.errors[1].line).toBe(3);
  });

  it('splits synonyms and relatedWords on ";" within a single CSV cell', () => {
    const result = parseWordRecords([
      { ...validRecord, synonyms: 'excitement; escapade ; quest', relatedWords: 'explore;journey' },
    ]);
    expect(result.rows[0].synonyms).toEqual(['excitement', 'escapade', 'quest']);
    expect(result.rows[0].relatedWords).toEqual(['explore', 'journey']);
  });

  it('leaves optional fields undefined when blank, rather than empty strings/arrays', () => {
    const result = parseWordRecords([{ ...validRecord, cefrLevel: '', pronunciation: '  ' }]);
    expect(result.rows[0].cefrLevel).toBeUndefined();
    expect(result.rows[0].pronunciation).toBeUndefined();
  });

  it('trims whitespace from required text fields', () => {
    const result = parseWordRecords([
      { ...validRecord, word: '  Adventure  ', definition: '  A trip.  ' },
    ]);
    expect(result.rows[0].word).toBe('Adventure');
    expect(result.rows[0].definition).toBe('A trip.');
  });

  it('parses category, usageNotes, phoneticRepresentation, and antonyms as plain/split fields', () => {
    const result = parseWordRecords([
      {
        ...validRecord,
        category: 'Emotion',
        usageNotes: 'formal register',
        phoneticRepresentation: '/ədˈventʃər/',
        antonyms: 'boredom; monotony',
      },
    ]);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        category: 'Emotion',
        usageNotes: 'formal register',
        phoneticRepresentation: '/ədˈventʃər/',
        antonyms: ['boredom', 'monotony'],
      }),
    );
  });

  it('accepts a numeric difficultyScore within 0-100', () => {
    const result = parseWordRecords([{ ...validRecord, difficultyScore: '42.5' }]);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].difficultyScore).toBe(42.5);
  });

  it('leaves difficultyScore undefined when the cell is blank', () => {
    const result = parseWordRecords([{ ...validRecord, difficultyScore: '' }]);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].difficultyScore).toBeUndefined();
  });

  it.each(['not-a-number', '-5', '101'])(
    'rejects an out-of-range or non-numeric difficultyScore (%s)',
    (bad) => {
      const result = parseWordRecords([{ ...validRecord, difficultyScore: bad }]);
      expect(result.rows).toHaveLength(0);
      expect(result.errors[0].reason).toContain('difficultyScore');
    },
  );

  it('processes independent rows even when one has an error', () => {
    const result = parseWordRecords([
      { ...validRecord, word: 'Beautiful' },
      { ...validRecord, word: 'cat' }, // too short
      { ...validRecord, word: 'Excellent' },
    ]);
    expect(result.rows.map((r) => r.word)).toEqual(['Beautiful', 'Excellent']);
    expect(result.errors).toHaveLength(1);
  });

  it('rejects an invalid cefrLevel value (V20 Vocabulary Vault §1)', () => {
    const result = parseWordRecords([{ ...validRecord, cefrLevel: 'Z9' }]);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0].reason).toContain('invalid cefrLevel');
  });

  it('accepts a valid cefrLevel and normalizes its case', () => {
    const result = parseWordRecords([{ ...validRecord, cefrLevel: 'b1' }]);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].cefrLevel).toBe('B1');
  });

  it('rejects an invalid category value (V20 Vocabulary Vault §1)', () => {
    const result = parseWordRecords([{ ...validRecord, category: 'Not A Real Category' }]);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0].reason).toContain('invalid category');
  });

  it('accepts a valid category', () => {
    const result = parseWordRecords([{ ...validRecord, category: 'Nature' }]);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].category).toBe('Nature');
  });

  it('rejects a duplicate ID within the same file (V20 Vocabulary Vault §1)', () => {
    const result = parseWordRecords([
      { ...validRecord, id: '501', word: 'Beautiful' },
      { ...validRecord, id: '501', word: 'Excellent' },
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].word).toBe('Beautiful');
    expect(result.errors[0].reason).toContain('duplicate ID');
  });

  it('does not flag duplicate IDs when the ID column is absent entirely', () => {
    const result = parseWordRecords([
      { ...validRecord, word: 'Beautiful' },
      { ...validRecord, word: 'Excellent' },
    ]);
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  describe('Vocabulary Vault V2 CSV shape (Correction & Completion Spec §5)', () => {
    const v2Record = {
      ID: '501',
      Word: 'abandon',
      Definition: 'To leave something completely or give it up.',
      'Part of Speech': 'Verb',
      'Example Sentence': 'The team decided to abandon the old strategy.',
      'Synonym 1': 'leave',
      'Synonym 2': 'give up',
      'CEFR Level': 'B1',
      'Difficulty Score': '45',
      Category: 'General',
      'Frequency Level': 'Common',
      'Word Family': 'abandonment, abandoned',
      'Usage Note': 'Often used when something is stopped permanently.',
    };

    it('normalizeImportRecord maps V2 headers onto canonical field names', () => {
      const normalized = normalizeImportRecord(v2Record);
      expect(normalized).toEqual(
        expect.objectContaining({
          word: 'abandon',
          definition: 'To leave something completely or give it up.',
          partOfSpeech: 'Verb',
          exampleSentence: 'The team decided to abandon the old strategy.',
          synonyms: 'leave;give up',
          cefrLevel: 'B1',
          difficultyScore: '45',
          category: 'General',
          frequencyLevel: 'Common',
          wordFamily: 'abandonment;abandoned',
          usageNotes: 'Often used when something is stopped permanently.',
        }),
      );
      expect(normalized).not.toHaveProperty('ID');
    });

    it('parseWordRecords accepts a full V2-shaped row end to end, deriving baseDifficulty from cefrLevel', () => {
      const result = parseWordRecords([v2Record]);
      expect(result.errors).toHaveLength(0);
      expect(result.rows[0]).toEqual(
        expect.objectContaining({
          word: 'abandon',
          baseDifficulty: 'INTERMEDIATE', // B1 -> INTERMEDIATE
          difficultyScore: 45,
          category: 'General',
          frequencyLevel: 'Common',
          synonyms: ['leave', 'give up'],
          wordFamily: ['abandonment', 'abandoned'],
        }),
      );
    });

    it.each([
      ['A1', 'BEGINNER'],
      ['A2', 'BEGINNER'],
      ['B1', 'INTERMEDIATE'],
      ['B2', 'INTERMEDIATE'],
      ['C1', 'ADVANCED'],
      ['C2', 'ADVANCED'],
    ])('derives baseDifficulty %s -> %s from cefrLevel alone', (cefr, expected) => {
      const result = parseWordRecords([{ ...v2Record, 'CEFR Level': cefr }]);
      expect(result.errors).toHaveLength(0);
      expect(result.rows[0].baseDifficulty).toBe(expected);
    });

    it('falls back to bucketing difficultyScore when cefrLevel is absent', () => {
      const { 'CEFR Level': _drop, ...withoutCefr } = v2Record;
      const result = parseWordRecords([{ ...withoutCefr, 'Difficulty Score': '80' }]);
      expect(result.errors).toHaveLength(0);
      expect(result.rows[0].baseDifficulty).toBe('ADVANCED');
    });

    it('an explicit baseDifficulty column still wins over cefrLevel/difficultyScore when present', () => {
      const result = parseWordRecords([
        { ...validRecord, baseDifficulty: 'ADVANCED', cefrLevel: 'A1' },
      ]);
      expect(result.errors).toHaveLength(0);
      expect(result.rows[0].baseDifficulty).toBe('ADVANCED');
    });

    it('reports a per-row error when one row has neither cefrLevel nor difficultyScore filled in, while others in the file do', () => {
      const blankRow = {
        ...v2Record,
        ID: '502',
        Word: 'abolish',
        'CEFR Level': '',
        'Difficulty Score': '',
      };
      const result = parseWordRecords([v2Record, blankRow]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].word).toBe('abandon');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reason).toContain('baseDifficulty');
    });

    it('reports a file-level error when no column can supply baseDifficulty at all', () => {
      const { 'CEFR Level': _cefr, 'Difficulty Score': _score, ...rest } = v2Record;
      const result = parseWordRecords([rest]);
      expect(result.rows).toHaveLength(0);
      expect(result.errors[0].reason).toContain('baseDifficulty');
    });

    it('old-format camelCase headers still parse exactly as before (no V2 columns present)', () => {
      const result = parseWordRecords([validRecord]);
      expect(result.errors).toHaveLength(0);
      expect(result.rows[0].baseDifficulty).toBe('BEGINNER');
    });
  });
});
