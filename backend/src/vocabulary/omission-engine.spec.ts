import {
  generateOmissionChallenge,
  omissionFractionForLevel,
  type MasteryLevel,
  type OmissionPatternType,
} from './omission-engine';

/** Deterministic RNG: cycles through a fixed sequence of [0,1) values. */
function sequenceRandom(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function reconstruct(displayPattern: string, answer: string, missingIndexes: number[]): string {
  const chars = displayPattern.split(' ');
  const missing = new Set(missingIndexes);
  return chars.map((ch, i) => (missing.has(i) ? answer[i] : ch.toLowerCase())).join('');
}

describe('omissionFractionForLevel', () => {
  it('is the fixed 40% baseline at NEW (spec §8/§9)', () => {
    expect(omissionFractionForLevel('NEW')).toBeCloseTo(0.4);
  });

  it('is the fixed 90% target at MASTERED (spec §8/§9)', () => {
    expect(omissionFractionForLevel('MASTERED')).toBeCloseTo(0.9);
  });

  it('interpolates the three intermediate levels evenly between 40% and 90% (four equal 12.5% steps)', () => {
    expect(omissionFractionForLevel('RECOGNIZING')).toBeCloseTo(0.525);
    expect(omissionFractionForLevel('RECALLING')).toBeCloseTo(0.65);
    expect(omissionFractionForLevel('STRONG')).toBeCloseTo(0.775);
  });

  it('is strictly increasing across all five levels', () => {
    const levels: MasteryLevel[] = ['NEW', 'RECOGNIZING', 'RECALLING', 'STRONG', 'MASTERED'];
    const fractions = levels.map(omissionFractionForLevel);
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]).toBeGreaterThan(fractions[i - 1]);
    }
  });
});

describe('generateOmissionChallenge', () => {
  it('lowercases the answer regardless of input casing', () => {
    const result = generateOmissionChallenge({
      word: 'CoMpAsSiOn',
      baseDifficulty: 'INTERMEDIATE',
      masteryLevel: 'NEW',
    });
    expect(result.answer).toBe('compassion');
  });

  it('produces a displayPattern with one character per letter of the word', () => {
    const result = generateOmissionChallenge({
      word: 'adventure',
      baseDifficulty: 'BEGINNER',
      masteryLevel: 'STRONG',
    });
    expect(result.displayPattern.split(' ')).toHaveLength('adventure'.length);
  });

  it('shows every non-blanked letter in uppercase, matching the original word', () => {
    const result = generateOmissionChallenge({
      word: 'knowledge',
      baseDifficulty: 'BEGINNER',
      masteryLevel: 'RECOGNIZING',
    });
    const chars = result.displayPattern.split(' ');
    const missing = new Set(result.missingIndexes);
    chars.forEach((ch, i) => {
      if (!missing.has(i)) expect(ch).toBe('knowledge'[i].toUpperCase());
    });
  });

  it('round-trips: filling missingIndexes back in reproduces the original word exactly', () => {
    for (const level of [
      'NEW',
      'RECOGNIZING',
      'RECALLING',
      'STRONG',
      'MASTERED',
    ] as MasteryLevel[]) {
      const result = generateOmissionChallenge({
        word: 'resilience',
        baseDifficulty: 'INTERMEDIATE',
        masteryLevel: level,
      });
      expect(reconstruct(result.displayPattern, result.answer, result.missingIndexes)).toBe(
        'resilience',
      );
    }
  });

  it('never blanks more letters than word length allows, and indexes are unique, sorted, in range', () => {
    const result = generateOmissionChallenge({
      word: 'compassion',
      baseDifficulty: 'ADVANCED',
      masteryLevel: 'MASTERED',
    });
    const sorted = [...result.missingIndexes].sort((a, b) => a - b);
    expect(result.missingIndexes).toEqual(sorted);
    expect(new Set(result.missingIndexes).size).toBe(result.missingIndexes.length);
    result.missingIndexes.forEach((i) => {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan('compassion'.length);
    });
  });

  describe('deterministic omission count (Volume 1&2 spec §8/§9)', () => {
    it('omits exactly 3 letters for a 7-letter word at the NEW baseline — the spec\u2019s own worked example', () => {
      // "thought" — 7 letters, no punctuation, all eligible: 7 * 0.4 = 2.8 -> rounds to 3.
      const result = generateOmissionChallenge({
        word: 'thought',
        baseDifficulty: 'INTERMEDIATE',
        masteryLevel: 'NEW',
      });
      expect(result.missingIndexes).toHaveLength(3);
    });

    it('gives the exact same omission count on every call for the same word and mastery level', () => {
      const counts = new Set<number>();
      for (let i = 0; i < 20; i++) {
        counts.add(
          generateOmissionChallenge({
            word: 'perspective',
            baseDifficulty: 'INTERMEDIATE',
            masteryLevel: 'RECALLING',
          }).missingIndexes.length,
        );
      }
      // Only the COUNT is deterministic — WHICH letters varies (tested separately below).
      expect(counts.size).toBe(1);
    });

    it('computes the exact rounded count at each level for an 11-letter word ("perspective")', () => {
      // 11 letters, 0 minRevealedLetters clamping needed at any level (max removable = 9).
      const expected: Record<MasteryLevel, number> = {
        NEW: Math.round(11 * 0.4), // 4.4 -> 4
        RECOGNIZING: Math.round(11 * 0.525), // 5.775 -> 6
        RECALLING: Math.round(11 * 0.65), // 7.15 -> 7
        STRONG: Math.round(11 * 0.775), // 8.525 -> 9
        MASTERED: Math.round(11 * 0.9), // 9.9 -> 10, but clamped below
      };
      (Object.keys(expected) as MasteryLevel[]).forEach((level) => {
        const result = generateOmissionChallenge({
          word: 'perspective',
          baseDifficulty: 'INTERMEDIATE',
          masteryLevel: level,
        });
        const maxRemovable = 11 - 2;
        expect(result.missingIndexes.length).toBe(Math.min(expected[level], maxRemovable));
      });
    });

    it('is not affected by baseDifficulty (spec §8/§9: percentage is defined purely by masteryLevel)', () => {
      const counts = new Set<number>();
      (['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const).forEach((baseDifficulty) => {
        const result = generateOmissionChallenge({
          word: 'sophisticated',
          baseDifficulty,
          masteryLevel: 'RECALLING',
        });
        counts.add(result.missingIndexes.length);
      });
      expect(counts.size).toBe(1);
    });
  });

  describe('minimum revealed letters safety net (spec §9)', () => {
    it('always leaves at least 2 letters revealed, even at MASTERED on a short 7-letter word', () => {
      const result = generateOmissionChallenge({
        word: 'thought',
        baseDifficulty: 'ADVANCED',
        masteryLevel: 'MASTERED',
      });
      // 7 * 0.9 = 6.3 -> rounds to 6, but the safety net caps it at 7 - 2 = 5.
      expect(result.missingIndexes.length).toBe(5);
    });
  });

  describe('non-determinism in WHICH letters are chosen (spec v1 §7/§11 — must not always produce the same pattern)', () => {
    it('generates more than one distinct missing-index set across repeated calls with identical input', () => {
      const patterns = new Set<string>();
      for (let i = 0; i < 30; i++) {
        const result = generateOmissionChallenge({
          word: 'motivation',
          baseDifficulty: 'INTERMEDIATE',
          masteryLevel: 'STRONG',
        });
        patterns.add(result.missingIndexes.join(','));
      }
      expect(patterns.size).toBeGreaterThan(1);
    });
  });

  describe('pattern strategies (spec v1 §10)', () => {
    it('VOWEL_HEAVY removes only vowels when removeCount is within the vowel count', () => {
      // "education": e,u,a,i,o are vowels at indexes 0,2,4,6,7 (5 vowels).
      // NEW level: 9 * 0.4 = 3.6 -> rounds to 4, which is within the vowel count.
      const result = generateOmissionChallenge({
        word: 'education',
        baseDifficulty: 'BEGINNER',
        masteryLevel: 'NEW',
        patternType: 'VOWEL_HEAVY',
      });
      const vowelIndexes = new Set([0, 2, 4, 6, 7]);
      expect(result.missingIndexes).toHaveLength(4);
      result.missingIndexes.forEach((i) => expect(vowelIndexes.has(i)).toBe(true));
    });

    it('CONSONANT_HEAVY removes only consonants when removeCount is within the consonant count', () => {
      const result = generateOmissionChallenge({
        word: 'rhythm',
        baseDifficulty: 'BEGINNER',
        masteryLevel: 'RECOGNIZING',
        patternType: 'CONSONANT_HEAVY',
      });
      // "rhythm" has zero vowels in the a/e/i/o/u sense — every letter is a consonant here.
      result.missingIndexes.forEach((i) => expect('rhythm'[i]).not.toMatch(/[aeiou]/));
    });

    it('CLUSTER removes a contiguous run of indexes', () => {
      const result = generateOmissionChallenge({
        word: 'creativity',
        baseDifficulty: 'INTERMEDIATE',
        masteryLevel: 'STRONG',
        patternType: 'CLUSTER',
      });
      const sorted = [...result.missingIndexes].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]).toBe(sorted[i - 1] + 1);
      }
    });

    it('reports patternUsed matching the explicitly requested (non-MIXED) pattern', () => {
      const types: Exclude<OmissionPatternType, 'MIXED'>[] = [
        'RANDOM',
        'VOWEL_HEAVY',
        'CONSONANT_HEAVY',
        'ALTERNATING',
        'CLUSTER',
        'POSITIONAL',
      ];
      types.forEach((patternType) => {
        const result = generateOmissionChallenge({
          word: 'flexible',
          baseDifficulty: 'INTERMEDIATE',
          masteryLevel: 'RECALLING',
          patternType,
        });
        expect(result.patternUsed).toBe(patternType);
      });
    });

    it('MIXED resolves to one of the six concrete strategies, never "MIXED" itself', () => {
      const result = generateOmissionChallenge({
        word: 'gratitude',
        baseDifficulty: 'INTERMEDIATE',
        masteryLevel: 'RECALLING',
        patternType: 'MIXED',
      });
      expect(result.patternUsed).not.toBe('MIXED');
      expect([
        'RANDOM',
        'VOWEL_HEAVY',
        'CONSONANT_HEAVY',
        'ALTERNATING',
        'CLUSTER',
        'POSITIONAL',
      ]).toContain(result.patternUsed);
    });

    it('defaults to MIXED when no patternType is given', () => {
      const result = generateOmissionChallenge({
        word: 'gratitude',
        baseDifficulty: 'INTERMEDIATE',
        masteryLevel: 'RECALLING',
      });
      expect(result.patternUsed).not.toBe('MIXED');
    });
  });

  it('uses an injected random function only for pattern/position selection, not the omission count', () => {
    const fixedRandom = sequenceRandom([0]);
    const result = generateOmissionChallenge({
      word: 'thought',
      baseDifficulty: 'BEGINNER',
      masteryLevel: 'NEW',
      random: fixedRandom,
    });
    expect(result.missingIndexes).toHaveLength(3); // same exact count as the non-injected NEW test above
  });
});
