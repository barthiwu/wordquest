import type { RevealedLetter } from './LetterBoxInput';

/**
 * Pure helpers for the letter-box answer used by ScrambleQuest and Complete It.
 *
 * LetterBoxInput keeps what the player typed as ONE compact string that covers
 * only the still-editable boxes (the boxes a hint has not filled), in order.
 * That keeps typing simple, but it means the string has no memory of WHICH box
 * each letter sits in: when a hint locks a new box, the compact string has to
 * be re-laid over the new set of editable boxes, and doing that naively slides
 * every later letter one box along ("Excet" + hint I -> "Exciet").
 */

function editablePositionsOf(length: number, revealed: readonly RevealedLetter[]): number[] {
  const locked = new Set(revealed.map((r) => r.position));
  return Array.from({ length }, (_, i) => i).filter((i) => !locked.has(i));
}

/**
 * Reconstructs the full word from the player's typed characters (which only
 * cover the still-editable, non-hint-revealed positions) plus the
 * hint-revealed letters, so the server always receives a complete answer of
 * the right length.
 */
export function mergeRevealedAnswer(
  typed: string,
  revealedLetters: readonly RevealedLetter[],
  length: number,
): string {
  return boxLetters(typed, revealedLetters, length).join('');
}

/** What each box shows ('' for an empty one): hint letters, then typed ones. */
export function boxLetters(
  typed: string,
  revealedLetters: readonly RevealedLetter[],
  length: number,
): string[] {
  const revealedMap = new Map(revealedLetters.map((r) => [r.position, r.letter]));
  const letters = Array.from({ length }, (_, i) => revealedMap.get(i) ?? '');
  editablePositionsOf(length, revealedLetters).forEach((position, editableIndex) => {
    letters[position] = typed[editableIndex] ?? '';
  });
  return letters;
}

/**
 * The compact typed string to use after a hint locks the box at `newPosition`.
 *
 * Every box keeps exactly what it showed, except the box the hint lands on:
 * the hint letter REPLACES whatever the player had typed there (it does not
 * push that letter, or any later one, into the next box). Typed letters that
 * sit beyond the hint's box stay in their own boxes, so the player's work is
 * never shifted.
 *
 * Example, word "excitement": typed "excet" fills boxes 0-4; a hint reveals
 * "i" at box 3. Boxes 0,1,2,4 keep E,X,C,T and box 3 becomes I, so the compact
 * string is "exct" over the new editable boxes (0,1,2,4,5,...).
 */
export function typedAfterReveal(
  typed: string,
  revealedBefore: readonly RevealedLetter[],
  newPosition: number,
  length: number,
): string {
  const before = editablePositionsOf(length, revealedBefore);
  // Box -> letter the player currently has in it (before the hint).
  const byBox = new Map<number, string>();
  before.forEach((position, i) => {
    const ch = typed[i];
    if (ch) byBox.set(position, ch);
  });
  byBox.delete(newPosition);

  const after = editablePositionsOf(length, [
    ...revealedBefore,
    { position: newPosition, letter: '' },
  ]);
  // The compact string cannot have holes: it ends at the last typed box.
  let out = '';
  for (const position of after) {
    const ch = byBox.get(position);
    if (ch === undefined) break;
    out += ch;
  }
  return out;
}
