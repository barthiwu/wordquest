import { gameplayRules } from '../config/gameplay-rules';

export type MasteryLevel = 'NEW' | 'RECOGNIZING' | 'RECALLING' | 'STRONG' | 'MASTERED';
export type WordDifficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

/**
 * Vocabulary Engine spec §10. MIXED — the engine's normal mode — isn't
 * "one blended pattern"; each call picks ONE of the other six uniformly
 * at random. Across the many times a player sees the same word, that
 * word experiences the full set of strategies, which is what keeps any
 * single presentation from being predictable (§11) without needing a
 * more elaborate merge algorithm than the spec actually calls for.
 */
export type OmissionPatternType =
  'RANDOM' | 'VOWEL_HEAVY' | 'CONSONANT_HEAVY' | 'ALTERNATING' | 'CLUSTER' | 'POSITIONAL' | 'MIXED';

const CONCRETE_PATTERN_TYPES: Exclude<OmissionPatternType, 'MIXED'>[] = [
  'RANDOM',
  'VOWEL_HEAVY',
  'CONSONANT_HEAVY',
  'ALTERNATING',
  'CLUSTER',
  'POSITIONAL',
];

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

/** Volume 1&2 spec §9: intermediate levels interpolate evenly between the NEW and MASTERED endpoints. */
const LEVEL_ORDER: MasteryLevel[] = ['NEW', 'RECOGNIZING', 'RECALLING', 'STRONG', 'MASTERED'];

export interface OmissionChallengeInput {
  /** The target word, e.g. "compassion". Case doesn't matter — it's normalized internally. */
  word: string;
  /** Accepted for forward-compatibility with callers, but not currently used in the omission-percentage calculation — Volume 1&2 spec §8/§9 defines the percentage purely by masteryLevel (the "3 omitted letters for a 7-letter NEW word" acceptance criterion is exact, with no per-word-difficulty adjustment on top). */
  baseDifficulty: WordDifficulty;
  masteryLevel: MasteryLevel;
  /** Defaults to MIXED, the engine's normal mode (spec §10). */
  patternType?: OmissionPatternType;
  /** Injectable for deterministic tests; real callers should omit this. */
  random?: () => number;
}

export interface OmissionChallenge {
  /** e.g. "C O M P _ S S I O N" — spaced, uppercase, blanks as "_". */
  displayPattern: string;
  /** Zero-based indexes into the normalized word that were blanked. */
  missingIndexes: number[];
  /** The normalized (lowercase) answer. */
  answer: string;
  /** Which concrete strategy actually ran (useful for logging/tests when patternType is MIXED). */
  patternUsed: Exclude<OmissionPatternType, 'MIXED'>;
}

/**
 * Generates a letter-omission challenge for a word. Per the spec, the
 * pattern is NEVER persisted as part of the word — call this fresh every
 * time a challenge is presented (§6/§17). The omission COUNT is
 * deterministic given a mastery level (Volume 1&2 spec §8/§9); WHICH
 * letters get blanked still varies between calls (spec v1 §7/§11) —
 * those are separate concerns, and only the second one is randomized.
 */
export function generateOmissionChallenge(input: OmissionChallengeInput): OmissionChallenge {
  const { masteryLevel, patternType = 'MIXED', random = Math.random } = input;
  const normalized = input.word.trim().toLowerCase();

  const eligibleIndexes: number[] = [];
  for (let i = 0; i < normalized.length; i++) {
    if (/[a-z]/.test(normalized[i])) eligibleIndexes.push(i);
  }

  const removeCount = resolveRemoveCount(eligibleIndexes.length, masteryLevel);

  const patternUsed: Exclude<OmissionPatternType, 'MIXED'> =
    patternType === 'MIXED' ? pickRandom(CONCRETE_PATTERN_TYPES, random) : patternType;

  const missingIndexes = selectIndexesToRemove(
    patternUsed,
    eligibleIndexes,
    removeCount,
    normalized,
    random,
  ).sort((a, b) => a - b);
  const missingSet = new Set(missingIndexes);

  const displayPattern = normalized
    .split('')
    .map((ch, i) => (missingSet.has(i) ? '_' : ch.toUpperCase()))
    .join(' ');

  return { displayPattern, missingIndexes, answer: normalized, patternUsed };
}

/**
 * The fraction of letters omitted for a given mastery level — Volume
 * 1&2 spec §8/§9: NEW is the fixed 40% baseline, MASTERED is the fixed
 * 90% target, and the three levels between interpolate evenly (4 equal
 * steps of 12.5%): NEW 40% → RECOGNIZING 52.5% → RECALLING 65% →
 * STRONG 77.5% → MASTERED 90%.
 */
export function omissionFractionForLevel(masteryLevel: MasteryLevel): number {
  const { noviceBaselineFraction, masteredTargetFraction } = gameplayRules.omission;
  const index = LEVEL_ORDER.indexOf(masteryLevel);
  const t = index / (LEVEL_ORDER.length - 1);
  return noviceBaselineFraction + t * (masteredTargetFraction - noviceBaselineFraction);
}

/**
 * Spec §8: "an explicit deterministic rounding rule for fractional
 * omission counts" — standard round-half-up (Math.round), matching the
 * spec's own worked example exactly: a 7-letter word at the 40% NEW
 * baseline is 7 * 0.4 = 2.8, which rounds to 3.
 *
 * The minRevealedLetters safety net (spec §9) is applied AFTER
 * rounding and always wins over the nominal percentage — this matters
 * most on short words at high mastery, where the raw math alone could
 * ask for an unsolvable challenge.
 */
function resolveRemoveCount(eligibleCount: number, masteryLevel: MasteryLevel): number {
  const { minRevealedLetters } = gameplayRules.omission;
  const fraction = omissionFractionForLevel(masteryLevel);

  const requested = Math.round(fraction * eligibleCount);
  const maxRemovable = Math.max(0, eligibleCount - minRevealedLetters);

  return clamp(requested, 0, maxRemovable);
}

function selectIndexesToRemove(
  pattern: Exclude<OmissionPatternType, 'MIXED'>,
  eligibleIndexes: number[],
  removeCount: number,
  normalized: string,
  random: () => number,
): number[] {
  if (removeCount <= 0) return [];

  switch (pattern) {
    case 'RANDOM':
      return shuffle(eligibleIndexes, random).slice(0, removeCount);

    case 'VOWEL_HEAVY':
      return prioritized(eligibleIndexes, (i) => VOWELS.has(normalized[i]), random).slice(
        0,
        removeCount,
      );

    case 'CONSONANT_HEAVY':
      return prioritized(eligibleIndexes, (i) => !VOWELS.has(normalized[i]), random).slice(
        0,
        removeCount,
      );

    case 'ALTERNATING': {
      const offset = random() < 0.5 ? 0 : 1;
      const step = eligibleIndexes.filter((_, pos) => pos % 2 === offset);
      // Alternating alone rarely supplies enough indexes to hit removeCount
      // (that's the point — it's a light pattern) — top up randomly from
      // the rest so higher mastery levels still get their full quota.
      const rest = eligibleIndexes.filter((idx) => !step.includes(idx));
      return [...shuffle(step, random), ...shuffle(rest, random)].slice(0, removeCount);
    }

    case 'CLUSTER': {
      if (removeCount >= eligibleIndexes.length) return [...eligibleIndexes];
      const maxStart = eligibleIndexes.length - removeCount;
      const start = Math.floor(random() * (maxStart + 1));
      return eligibleIndexes.slice(start, start + removeCount);
    }

    case 'POSITIONAL': {
      // "Difficult positions" — biased toward the middle of the word,
      // since word-shape recognition makes the first/last letters the
      // easiest to guess from context regardless of mastery.
      const center = (eligibleIndexes.length - 1) / 2;
      return prioritizedByScore(
        eligibleIndexes,
        (idx, pos) => -Math.abs(pos - center),
        random,
      ).slice(0, removeCount);
    }
  }
}

/** Shuffles `items` so items where `predicate` is true sort before the rest, randomized within each group. */
function prioritized<T>(items: T[], predicate: (item: T) => boolean, random: () => number): T[] {
  const matching = shuffle(
    items.filter((i) => predicate(i)),
    random,
  );
  const rest = shuffle(
    items.filter((i) => !predicate(i)),
    random,
  );
  return [...matching, ...rest];
}

/** Sorts eligibleIndexes by a score (higher = removed first), with random jitter to break ties/avoid a fixed order. */
function prioritizedByScore(
  eligibleIndexes: number[],
  score: (idx: number, pos: number) => number,
  random: () => number,
): number[] {
  return eligibleIndexes
    .map((idx, pos) => ({ idx, score: score(idx, pos) + random() * 0.5 }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.idx);
}

function pickRandom<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
