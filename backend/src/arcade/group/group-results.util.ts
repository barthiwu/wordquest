import { GroupSide, rankGroup } from './group.util';

/**
 * Pure rules for the Group Play result sheet: what the host sees (and
 * downloads) after a round. One row per player, one cell per word with
 * exactly what they typed and whether it was right. No I/O, so the layout
 * and the CSV escaping are covered by plain unit tests.
 */

const GAME_LABEL: Record<string, string> = {
  SCRAMBLE_QUEST: 'ScrambleQuest',
  COMPLETE_IT: 'Complete It',
  HANGMAN: 'Hangman',
};

/** The name players see for a game ("Complete It"), falling back to the raw code. */
export function gameLabel(game: string): string {
  return GAME_LABEL[game] ?? game;
}

export type SheetPlayerState = 'NOT_STARTED' | 'PLAYING' | 'FINISHED';

/**
 * What a cell's text is: the spelling the player typed (ScrambleQuest,
 * Complete It) or, for Hangman, the letters they guessed in order.
 */
export type SheetTypedKind = 'WORD' | 'LETTERS';

export interface SheetWord {
  index: number;
  word: string;
  definition: string;
}

export interface SheetCell {
  /** Exactly what the player entered; null when they never reached this word. */
  typed: string | null;
  /** null = not answered. */
  isCorrect: boolean | null;
  /** The word's timer ran out (the entry, if any, was too late). */
  timedOut: boolean;
  /** Server-measured time on this word, ms. */
  timeMs: number | null;
}

export interface SheetPlayer {
  userId: string;
  name: string;
  isHost: boolean;
  state: SheetPlayerState;
  /** 1-based, shared by exact ties; null for someone who has not started. */
  rank: number | null;
  correct: number;
  answered: number;
  /** Sum of the per-word times: the time the player actually used. */
  totalTimeMs: number;
  /** One per word, in play order. */
  cells: SheetCell[];
}

export interface GroupResultSheet {
  groupId: string;
  title: string | null;
  game: string;
  /** true once the round has ended: the sheet will not change any more. */
  final: boolean;
  typedKind: SheetTypedKind;
  generatedAt: string;
  activatedAt: string | null;
  endedAt: string | null;
  words: SheetWord[];
  players: SheetPlayer[];
}

export interface SheetAnswerInput {
  wordIndex: number;
  submittedAnswer: string;
  isCorrect: boolean;
  timedOut: boolean;
  responseTimeMs: number | null;
}

export interface SheetMemberInput {
  userId: string;
  name: string;
  isHost: boolean;
  /** null = the member never opened the round. */
  session: { completed: boolean; answers: readonly SheetAnswerInput[] } | null;
}

export interface BuildSheetInput {
  groupId: string;
  title: string | null;
  game: string;
  ended: boolean;
  activatedAt: Date | null;
  endedAt: Date | null;
  now: Date;
  words: readonly SheetWord[];
  members: readonly SheetMemberInput[];
}

/** Hangman records the letters guessed; the other games record the typed word. */
export function typedKindFor(game: string): SheetTypedKind {
  return game === 'HANGMAN' ? 'LETTERS' : 'WORD';
}

/**
 * Builds the sheet: ranks the players the same way the on-screen results do
 * (see rankGroup) and lines every answer up under its word. A word the
 * player did not reach is an empty cell, never a guess.
 */
export function buildResultSheet(input: BuildSheetInput): GroupResultSheet {
  const sides: GroupSide[] = input.members.map((m) => {
    if (!m.session) {
      return { userId: m.userId, state: 'NOT_STARTED', correct: 0, answered: 0, timeMs: 0 };
    }
    return {
      userId: m.userId,
      state: m.session.completed ? 'FINISHED' : 'PLAYING',
      correct: m.session.answers.filter((a) => a.isCorrect).length,
      answered: m.session.answers.length,
      timeMs: m.session.answers.reduce((sum, a) => sum + (a.responseTimeMs ?? 0), 0),
    };
  });
  const ranked = rankGroup(sides);
  const memberById = new Map(input.members.map((m) => [m.userId, m]));

  const players: SheetPlayer[] = ranked.map((side) => {
    const m = memberById.get(side.userId) as SheetMemberInput;
    const byIndex = new Map((m.session?.answers ?? []).map((a) => [a.wordIndex, a]));
    const cells: SheetCell[] = input.words.map((w) => {
      const a = byIndex.get(w.index);
      if (!a) return { typed: null, isCorrect: null, timedOut: false, timeMs: null };
      return {
        typed: a.submittedAnswer,
        isCorrect: a.isCorrect,
        timedOut: a.timedOut,
        timeMs: a.responseTimeMs,
      };
    });
    return {
      userId: side.userId,
      name: m.name,
      isHost: m.isHost,
      state: side.state,
      rank: side.rank,
      correct: side.correct,
      answered: side.answered,
      totalTimeMs: side.timeMs,
      cells,
    };
  });

  return {
    groupId: input.groupId,
    title: input.title,
    game: input.game,
    final: input.ended,
    typedKind: typedKindFor(input.game),
    generatedAt: input.now.toISOString(),
    activatedAt: input.activatedAt?.toISOString() ?? null,
    endedAt: input.endedAt?.toISOString() ?? null,
    words: [...input.words],
    players,
  };
}

/** "3:07" for 187_000 ms; hours roll into minutes ("75:00"). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Seconds to one decimal, as a plain number string ("12.3"). */
export function formatSeconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1);
}

export type CellVerdict = 'CORRECT' | 'WRONG' | 'TIMED_OUT' | 'NOT_ANSWERED';

export function cellVerdict(cell: SheetCell): CellVerdict {
  if (cell.isCorrect === null) return 'NOT_ANSWERED';
  if (cell.isCorrect) return 'CORRECT';
  return cell.timedOut ? 'TIMED_OUT' : 'WRONG';
}

// ── CSV ──────────────────────────────────────────────────────────────────

/**
 * Spreadsheet programs run a cell that starts with = + - @ (or a tab / CR) as
 * a formula. Typed answers and player names are chosen by other people, so
 * those cells get a leading apostrophe and always stay text.
 */
export function csvText(value: string | null | undefined): string {
  const text = (value ?? '').replace(/\r\n|\r|\n/g, ' ');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return csvRaw(safe);
}

/** Quotes a cell when it holds a comma, quote or line break. Numbers use this directly. */
export function csvRaw(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const VERDICT_LABEL: Record<CellVerdict, string> = {
  CORRECT: 'Correct',
  WRONG: 'Wrong',
  TIMED_OUT: 'Timed out',
  NOT_ANSWERED: 'Not answered',
};

/**
 * The sheet as CSV: a summary table (one row per player), a blank line, then
 * the answers table (one row per player and word, with what was typed and
 * whether it was right). UTF-8 with a byte-order mark so Excel reads names
 * and words in any script correctly.
 */
export function toCsv(sheet: GroupResultSheet): string {
  const rows: string[] = [];
  const line = (cells: Array<string | number>) => rows.push(cells.join(','));
  const typedHeader = sheet.typedKind === 'LETTERS' ? 'Letters guessed' : 'Typed';

  line([csvText('Group result sheet')]);
  line([csvText('Title'), csvText(sheet.title ?? '')]);
  line([csvText('Game'), csvText(gameLabel(sheet.game))]);
  line([csvText('Status'), csvText(sheet.final ? 'Final' : 'Round still running')]);
  line([csvText('Generated'), csvText(sheet.generatedAt)]);
  line([]);

  line(
    [
      'Rank',
      'Player',
      'Status',
      'Correct',
      'Answered',
      'Words',
      'Total time (mm:ss)',
      'Total time (s)',
    ].map(csvText),
  );
  for (const p of sheet.players) {
    line([
      p.rank ?? '',
      csvText(p.name),
      csvText(
        p.state === 'FINISHED' ? 'Finished' : p.state === 'PLAYING' ? 'Playing' : 'Did not start',
      ),
      p.correct,
      p.answered,
      sheet.words.length,
      csvText(formatDuration(p.totalTimeMs)),
      formatSeconds(p.totalTimeMs),
    ]);
  }
  line([]);

  line(
    ['Player', 'Rank', 'Word #', 'Correct word', typedHeader, 'Result', 'Time (s)'].map(csvText),
  );
  for (const p of sheet.players) {
    sheet.words.forEach((w, i) => {
      const cell = p.cells[i];
      line([
        csvText(p.name),
        p.rank ?? '',
        w.index + 1,
        csvText(w.word),
        csvText(cell.typed),
        csvText(VERDICT_LABEL[cellVerdict(cell)]),
        cell.timeMs === null ? '' : formatSeconds(cell.timeMs),
      ]);
    });
  }
  return `﻿${rows.join('\r\n')}\r\n`;
}

// ── File names ───────────────────────────────────────────────────────────

/** A safe, ASCII file name stem like "wordquest-jss2-vocabulary-2026-10-12". */
export function sheetFileStem(sheet: GroupResultSheet): string {
  const base = (sheet.title ?? sheet.game)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const day = (sheet.endedAt ?? sheet.generatedAt).slice(0, 10);
  return `wordquest-${base || 'group'}-${day}`;
}
