import type { GroupResultCell } from '@/services/arcadeGroups';

/** What a typed answer was: used to pick its colour and its words. */
export type CellVerdict = 'CORRECT' | 'WRONG' | 'TIMED_OUT' | 'NOT_ANSWERED';

export function cellVerdict(cell: GroupResultCell): CellVerdict {
  if (cell.isCorrect === null) return 'NOT_ANSWERED';
  if (cell.isCorrect) return 'CORRECT';
  return cell.timedOut ? 'TIMED_OUT' : 'WRONG';
}

/** Seconds to one decimal ("12.3"), for a per-word time. */
export function formatSeconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1);
}

export type ResultFormat = 'csv' | 'pdf';

export const RESULT_FORMATS: Record<ResultFormat, { mimeType: string; uti: string }> = {
  csv: { mimeType: 'text/csv', uti: 'public.comma-separated-values-text' },
  pdf: { mimeType: 'application/pdf', uti: 'com.adobe.pdf' },
};

const GAME_SLUG: Record<string, string> = {
  SCRAMBLE_QUEST: 'scramblequest',
  COMPLETE_IT: 'complete-it',
  HANGMAN: 'hangman',
};

/**
 * "wordquest-jss2-vocabulary-2026-10-12.csv": a safe ASCII name from the
 * group's title (or its game) and the day it ended. Matches the name the
 * server would send, so the file is named the same on every platform.
 */
export function resultFileName(
  group: { title: string | null; game: string; endedAt: string | null },
  format: ResultFormat,
  now: Date = new Date(),
): string {
  const base = (group.title ?? GAME_SLUG[group.game] ?? 'group')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const day = (group.endedAt ?? now.toISOString()).slice(0, 10);
  return `wordquest-${base || 'group'}-${day}.${format}`;
}
