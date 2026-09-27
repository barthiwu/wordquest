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
