import { shuffleIndexes } from '../scramble-quest/scramble.util';

/**
 * Pure Hangman rules. No database, no clock: everything here is a function
 * of the word and the letters guessed so far, so the service can rebuild a
 * word's whole state from the stored guess list alone.
 */

/** Lower-cases a character and strips accents, so a player can guess "e"
 * for a headword containing "é". Returns '' for anything that is not a
 * letter (spaces, hyphens, apostrophes, digits). */
export function foldLetter(ch: string): string {
  const folded = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return /^\p{L}$/u.test(folded) ? folded : '';
}

/** True for a single a-z guess (after trimming/lower-casing). */
export function isValidGuess(raw: string): boolean {
  return /^[a-zA-Z]$/.test(raw);
}

/** The distinct letters a word contains, folded. */
export function distinctLetters(text: string): Set<string> {
  const out = new Set<string>();
  for (const ch of text) {
    const f = foldLetter(ch);
    if (f) out.add(f);
  }
  return out;
}

export interface HangmanState {
  /** One entry per character of the word: the character if it is revealed
   * (guessed, or not a letter), otherwise '_'. */
  pattern: string;
  wrongLetters: string[];
  wrongCount: number;
  won: boolean;
  lost: boolean;
}

/** Derives the state of the current word from the ordered guess list. */
export function evaluateGuesses(text: string, guesses: string[], maxWrong: number): HangmanState {
  const letters = distinctLetters(text);
  const guessed = new Set(guesses);
  const wrongLetters = guesses.filter((g) => !letters.has(g));

  let pattern = '';
  for (const ch of text) {
    const f = foldLetter(ch);
    pattern += f === '' || guessed.has(f) ? ch : '_';
  }

  const won = [...letters].every((l) => guessed.has(l));
  const wrongCount = wrongLetters.length;
  return { pattern, wrongLetters, wrongCount, won, lost: !won && wrongCount >= maxWrong };
}

/**
 * Picks the letter a hint reveals: a letter of the word the player has not
 * guessed yet, chosen by a seeded shuffle so it is reproducible but not
 * simply "the first missing letter". Returns null when revealing one
 * would leave nothing to solve (a hint may never finish the word).
 */
export function pickHintLetter(text: string, guesses: string[], seed: string): string | null {
  const guessed = new Set(guesses);
  const missing = [...distinctLetters(text)].filter((l) => !guessed.has(l));
  if (missing.length <= 1) return null;

  const order = shuffleIndexes(
    Array.from({ length: text.length }, (_, i) => i),
    seed,
  );
  for (const position of order) {
    const f = foldLetter(text[position]);
    if (f && !guessed.has(f)) return f;
  }
  return null;
}
