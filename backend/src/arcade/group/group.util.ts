import { randomInt } from 'crypto';

/**
 * Pure rules for Group Play: invite codes, ranking and per-word results.
 * No I/O, so every edge is covered by plain unit tests.
 */

/** 31 symbols with no 0/O/1/I/L look-alikes, so a code read aloud or copied from a screen survives. */
export const GROUP_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateGroupCode(
  length: number,
  pick: (max: number) => number = randomInt,
): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += GROUP_CODE_ALPHABET[pick(GROUP_CODE_ALPHABET.length)];
  return out;
}

/**
 * Cleans what a person typed or pasted (case, spaces, dashes) into a code,
 * or null when it cannot be one. Characters outside the alphabet are
 * rejected rather than guessed at.
 */
export function normalizeGroupCode(raw: string | undefined | null, length: number): string | null {
  if (!raw) return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== length) return null;
  for (const ch of code) if (!GROUP_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

export type GroupMemberState = 'NOT_STARTED' | 'PLAYING' | 'FINISHED';

/** One member's progress, summed from their session's answers. */
export interface GroupSide {
  userId: string;
  state: GroupMemberState;
  correct: number;
  answered: number;
  /** Sum of server-measured response times, ms. */
  timeMs: number;
}

export interface RankedGroupSide extends GroupSide {
  /** 1-based, shared by exact ties; null for someone who has not started. */
  rank: number | null;
}

/**
 * Orders members for the results table: most correct first; at equal
 * correct, someone who finished beats someone still playing; then the lower
 * total time. Players who have not started are listed last (in the order
 * given) with no rank. Exact ties share a rank.
 */
export function rankGroup(sides: readonly GroupSide[]): RankedGroupSide[] {
  const started = sides.filter((s) => s.state !== 'NOT_STARTED');
  const idle = sides.filter((s) => s.state === 'NOT_STARTED');
  const sorted = [...started].sort(
    (a, b) =>
      b.correct - a.correct ||
      Number(b.state === 'FINISHED') - Number(a.state === 'FINISHED') ||
      a.timeMs - b.timeMs,
  );
  const ranked: RankedGroupSide[] = [];
  sorted.forEach((side, i) => {
    const prev = sorted[i - 1];
    const tied =
      prev !== undefined &&
      prev.correct === side.correct &&
      (prev.state === 'FINISHED') === (side.state === 'FINISHED') &&
      prev.timeMs === side.timeMs;
    ranked.push({ ...side, rank: tied ? (ranked[i - 1].rank as number) : i + 1 });
  });
  for (const side of idle) ranked.push({ ...side, rank: null });
  return ranked;
}

export interface GroupAnswerRow {
  wordIndex: number;
  isCorrect: boolean;
}

export interface GroupWordStat {
  wordIndex: number;
  wordId: string;
  /** Members who answered this word. */
  attempts: number;
  /** Of those, how many got it right. */
  correct: number;
}

/** How the group did on each word, in play order: the teacher's "what did they find hard". */
export function wordStats(
  wordIds: readonly string[],
  answers: readonly GroupAnswerRow[],
): GroupWordStat[] {
  const stats: GroupWordStat[] = wordIds.map((wordId, wordIndex) => ({
    wordIndex,
    wordId,
    attempts: 0,
    correct: 0,
  }));
  for (const a of answers) {
    const s = stats[a.wordIndex];
    if (!s) continue;
    s.attempts += 1;
    if (a.isCorrect) s.correct += 1;
  }
  return stats;
}
