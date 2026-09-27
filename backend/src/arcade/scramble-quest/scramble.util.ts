/**
 * Deterministic word-scrambling for ScrambleQuest (spec §5: "Show
 * scrambled letters; never show the target word"). Deterministic and
 * seeded by (sessionId, wordIndex) rather than persisted or re-rolled on
 * every request — the same word, in the same session slot, always
 * scrambles to the same arrangement, so re-fetching the current
 * challenge (an app relaunch, a flaky retry) never shows the player a
 * different puzzle for a word they've already started looking at.
 */

/** xmur3 string hash -> a 32-bit seed for sfc32 below. Small, fast, and
 * good enough for "shuffle order," not cryptography. */
function seedFromString(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** sfc32 PRNG — deterministic given the same seed, which is the whole
 * point here (see module doc comment above). */
function makeRng(seed: number): () => number {
  let a = seed;
  let b = seed ^ 0x9e3779b9;
  let c = seed ^ 0x243f6a88;
  let d = seed ^ 0xb7e15162;
  return function rng() {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * Scrambles `word`'s letters, seeded so the same (word, seed) pair
 * always produces the same arrangement. Guarantees the result differs
 * from the input for any word with at least two distinct letters
 * (retries a few times); a word made of a single repeated letter (e.g.
 * "aaa") cannot be scrambled into something different and is returned
 * as-is after exhausting retries.
 */
export function scrambleWord(word: string, seed: string): string {
  if (word.length <= 1) return word;

  const rng = makeRng(seedFromString(seed));
  const letters = word.split('');

  const MAX_ATTEMPTS = 6;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Fisher-Yates, driven by the seeded RNG.
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    const result = letters.join('');
    if (result !== word) return result;
  }
  return letters.join('');
}

/**
 * Deterministic, seeded order in which a word's letters get revealed by
 * hints. Randomized (not simply left-to-right) so hints don't trivially
 * hand the player the word's prefix — but deterministic per (session,
 * word) so requestHint() and buildChallengeView() independently agree
 * on which position each hint count reveals, without persisting the
 * order anywhere. The word's final letter is never eligible (spec:
 * a hint can never fully give away the word).
 */
export function hintRevealOrder(word: string, seed: string): number[] {
  const eligible = Array.from({ length: Math.max(word.length - 1, 0) }, (_, i) => i);
  if (eligible.length <= 1) return eligible;

  const rng = makeRng(seedFromString(seed));
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  return eligible;
}

/**
 * Deterministic, seeded shuffle of a caller-supplied index list -- same
 * seeded-RNG idea as hintRevealOrder above (randomized order,
 * reproducible for a given seed so re-deriving it twice agrees), just
 * over indexes the caller already knows rather than deriving eligible
 * ones from a word's length. hintRevealOrder assumes "every letter but
 * the last" is eligible, which fits ScrambleQuest/Complete It (the
 * whole word starts hidden); Daily Quest's letter-reveal
 * (quests.service.ts) instead starts from a mastery-dependent SUBSET of
 * the word (the omission engine's blanks) that's already been decided
 * elsewhere, so it shuffles that subset directly with this instead.
 */
export function shuffleIndexes(indexes: number[], seed: string): number[] {
  const shuffled = [...indexes];
  const rng = makeRng(seedFromString(seed));
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
