import {
  buildResultSheet,
  BuildSheetInput,
  cellVerdict,
  csvRaw,
  csvText,
  formatDuration,
  formatSeconds,
  GroupResultSheet,
  sheetFileStem,
  toCsv,
  typedKindFor,
} from './group-results.util';

const words = [
  { index: 0, word: 'reject', definition: 'to refuse' },
  { index: 1, word: 'accept', definition: 'to agree' },
  { index: 2, word: 'detect', definition: 'to notice' },
];

const answer = (
  wordIndex: number,
  submittedAnswer: string,
  isCorrect: boolean,
  responseTimeMs: number | null,
  timedOut = false,
) => ({ wordIndex, submittedAnswer, isCorrect, timedOut, responseTimeMs });

function input(over: Partial<BuildSheetInput> = {}): BuildSheetInput {
  return {
    groupId: 'g1',
    title: 'JSS2 vocabulary',
    game: 'COMPLETE_IT',
    ended: true,
    activatedAt: new Date('2026-10-12T09:00:00Z'),
    endedAt: new Date('2026-10-12T10:00:00Z'),
    now: new Date('2026-10-12T10:05:00Z'),
    words,
    members: [
      {
        userId: 'host',
        name: 'Mrs Okoro',
        isHost: true,
        session: null,
      },
      {
        userId: 'ada',
        name: 'Ada',
        isHost: false,
        session: {
          completed: true,
          answers: [
            answer(0, 'recjet', false, 12_000),
            answer(1, 'accept', true, 8_000),
            answer(2, 'detect', true, 5_500),
          ],
        },
      },
      {
        userId: 'bayo',
        name: 'Bayo',
        isHost: false,
        session: {
          completed: false,
          answers: [answer(0, 'reject', true, 4_000)],
        },
      },
    ],
    ...over,
  };
}

describe('buildResultSheet', () => {
  it('ranks players like the on-screen results and keeps what each one typed', () => {
    const sheet = buildResultSheet(input());
    expect(sheet.players.map((p) => [p.name, p.rank])).toEqual([
      ['Ada', 1],
      ['Bayo', 2],
      ['Mrs Okoro', null],
    ]);
    const ada = sheet.players[0];
    expect(ada.cells.map((c) => c.typed)).toEqual(['recjet', 'accept', 'detect']);
    expect(ada.cells.map((c) => c.isCorrect)).toEqual([false, true, true]);
  });

  it("totals each player's own time and counts", () => {
    const [ada, bayo, host] = buildResultSheet(input()).players;
    expect(ada).toMatchObject({ correct: 2, answered: 3, totalTimeMs: 25_500, state: 'FINISHED' });
    expect(bayo).toMatchObject({ correct: 1, answered: 1, totalTimeMs: 4_000, state: 'PLAYING' });
    expect(host).toMatchObject({ correct: 0, answered: 0, totalTimeMs: 0, state: 'NOT_STARTED' });
  });

  it('leaves a word the player never reached empty, not guessed', () => {
    const bayo = buildResultSheet(input()).players[1];
    expect(bayo.cells[1]).toEqual({ typed: null, isCorrect: null, timedOut: false, timeMs: null });
    expect(bayo.cells[2].typed).toBeNull();
  });

  it('puts answers under the right word even when they arrive out of order', () => {
    const sheet = buildResultSheet(
      input({
        members: [
          {
            userId: 'ada',
            name: 'Ada',
            isHost: false,
            session: {
              completed: true,
              answers: [
                answer(2, 'detect', true, 1),
                answer(0, 'rejct', false, 2),
                answer(1, 'accept', true, 3),
              ],
            },
          },
        ],
      }),
    );
    expect(sheet.players[0].cells.map((c) => c.typed)).toEqual(['rejct', 'accept', 'detect']);
  });

  it('flags the sheet as not final while the round is running', () => {
    expect(buildResultSheet(input({ ended: false })).final).toBe(false);
    expect(buildResultSheet(input()).final).toBe(true);
  });

  it('records a timed-out word and treats it as a miss', () => {
    const sheet = buildResultSheet(
      input({
        members: [
          {
            userId: 'ada',
            name: 'Ada',
            isHost: false,
            session: { completed: true, answers: [answer(0, '', false, 45_000, true)] },
          },
        ],
      }),
    );
    expect(cellVerdict(sheet.players[0].cells[0])).toBe('TIMED_OUT');
  });
});

describe('typedKindFor', () => {
  it('says Hangman records letters and the other games record a word', () => {
    expect(typedKindFor('HANGMAN')).toBe('LETTERS');
    expect(typedKindFor('COMPLETE_IT')).toBe('WORD');
    expect(typedKindFor('SCRAMBLE_QUEST')).toBe('WORD');
  });
});

describe('cellVerdict', () => {
  it('maps a cell to correct / wrong / timed out / not answered', () => {
    expect(cellVerdict({ typed: 'a', isCorrect: true, timedOut: false, timeMs: 1 })).toBe(
      'CORRECT',
    );
    expect(cellVerdict({ typed: 'a', isCorrect: false, timedOut: false, timeMs: 1 })).toBe('WRONG');
    expect(cellVerdict({ typed: 'a', isCorrect: false, timedOut: true, timeMs: 1 })).toBe(
      'TIMED_OUT',
    );
    expect(cellVerdict({ typed: null, isCorrect: null, timedOut: false, timeMs: null })).toBe(
      'NOT_ANSWERED',
    );
  });
});

describe('formatting', () => {
  it('formats durations as m:ss and seconds to one decimal', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(187_000)).toBe('3:07');
    expect(formatDuration(4_500_000)).toBe('75:00');
    expect(formatDuration(-5)).toBe('0:00');
    expect(formatSeconds(12_345)).toBe('12.3');
    expect(formatSeconds(0)).toBe('0.0');
  });
});

describe('CSV', () => {
  it('quotes cells with commas, quotes and line breaks', () => {
    expect(csvRaw('plain')).toBe('plain');
    expect(csvRaw('a,b')).toBe('"a,b"');
    expect(csvRaw('say "hi"')).toBe('"say ""hi"""');
    expect(csvRaw(42)).toBe('42');
  });

  it('neutralises spreadsheet formulas in text cells', () => {
    expect(csvText('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvText('+1')).toBe("'+1");
    expect(csvText('-2')).toBe("'-2");
    expect(csvText('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvText('\tcmd')).toBe("'\tcmd");
    expect(csvText('reject')).toBe('reject');
    expect(csvText(null)).toBe('');
  });

  it('flattens line breaks inside a typed answer', () => {
    expect(csvText('line1\nline2')).toBe('line1 line2');
  });

  it('writes a summary table and an answers table with the typed words and verdicts', () => {
    const csv = toCsv(buildResultSheet(input()));
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(lines).toContain(
      'Rank,Player,Status,Correct,Answered,Words,Total time (mm:ss),Total time (s)',
    );
    expect(lines).toContain('1,Ada,Finished,2,3,3,0:26,25.5');
    expect(lines).toContain('2,Bayo,Playing,1,1,3,0:04,4.0');
    expect(lines).toContain(',Mrs Okoro,Did not start,0,0,3,0:00,0.0');
    expect(lines).toContain('Player,Rank,Word #,Correct word,Typed,Result,Time (s)');
    expect(lines).toContain('Ada,1,1,reject,recjet,Wrong,12.0');
    expect(lines).toContain('Ada,1,2,accept,accept,Correct,8.0');
    expect(lines).toContain('Bayo,2,2,accept,,Not answered,');
  });

  it('labels the Hangman column as letters guessed', () => {
    const csv = toCsv(buildResultSheet(input({ game: 'HANGMAN' })));
    expect(csv).toContain('Correct word,Letters guessed,Result');
  });

  it('keeps a hostile player name from becoming a formula', () => {
    const sheet = buildResultSheet(
      input({
        members: [
          {
            userId: 'x',
            name: "=cmd|' /C calc'!A0",
            isHost: false,
            session: { completed: true, answers: [answer(0, '=1+1', false, 100)] },
          },
        ],
      }),
    );
    const csv = toCsv(sheet);
    expect(csv).not.toMatch(/(^|,|\r\n)=/);
    expect(csv).toContain("'=1+1");
  });
});

describe('sheetFileStem', () => {
  const base = (over: Partial<GroupResultSheet>): GroupResultSheet => ({
    ...buildResultSheet(input()),
    ...over,
  });

  it('builds a safe ASCII file name from the title and end date', () => {
    expect(sheetFileStem(base({}))).toBe('wordquest-jss2-vocabulary-2026-10-12');
  });

  it('falls back to the game when the title has no usable characters', () => {
    expect(sheetFileStem(base({ title: '课堂' }))).toBe('wordquest-group-2026-10-12');
    expect(sheetFileStem(base({ title: null, game: 'HANGMAN' }))).toBe(
      'wordquest-hangman-2026-10-12',
    );
  });

  it('never lets a title add path or header characters', () => {
    const stem = sheetFileStem(base({ title: '../../etc/passwd"\r\nX: y' }));
    expect(stem).toMatch(/^[a-z0-9-]+$/);
  });
});
