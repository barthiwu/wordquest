import { cellVerdict, formatSeconds, resultFileName } from './groupResultsFormat';

describe('cellVerdict', () => {
  it('tells a right answer, a wrong one, a timeout and a word never reached apart', () => {
    expect(cellVerdict({ typed: 'reject', isCorrect: true, timedOut: false, timeMs: 1 })).toBe(
      'CORRECT',
    );
    expect(cellVerdict({ typed: 'recjet', isCorrect: false, timedOut: false, timeMs: 1 })).toBe(
      'WRONG',
    );
    expect(cellVerdict({ typed: '', isCorrect: false, timedOut: true, timeMs: 45_000 })).toBe(
      'TIMED_OUT',
    );
    expect(cellVerdict({ typed: null, isCorrect: null, timedOut: false, timeMs: null })).toBe(
      'NOT_ANSWERED',
    );
  });
});

describe('formatSeconds', () => {
  it('shows one decimal and never goes negative', () => {
    expect(formatSeconds(12_345)).toBe('12.3');
    expect(formatSeconds(0)).toBe('0.0');
    expect(formatSeconds(-50)).toBe('0.0');
  });
});

describe('resultFileName', () => {
  const now = new Date('2026-10-20T08:00:00Z');

  it('uses the title and the day the round ended', () => {
    expect(
      resultFileName(
        { title: 'JSS2 Vocabulary', game: 'COMPLETE_IT', endedAt: '2026-10-12T10:00:00Z' },
        'csv',
        now,
      ),
    ).toBe('wordquest-jss2-vocabulary-2026-10-12.csv');
  });

  it('falls back to the game name, and to today while the round is still running', () => {
    expect(resultFileName({ title: null, game: 'HANGMAN', endedAt: null }, 'pdf', now)).toBe(
      'wordquest-hangman-2026-10-20.pdf',
    );
    expect(resultFileName({ title: '课堂', game: 'COMPLETE_IT', endedAt: null }, 'pdf', now)).toBe(
      'wordquest-group-2026-10-20.pdf',
    );
  });

  it('never lets a title add path or odd characters', () => {
    const name = resultFileName(
      { title: '../../etc/passwd"\n', game: 'COMPLETE_IT', endedAt: null },
      'csv',
      now,
    );
    expect(name).toMatch(/^wordquest-[a-z0-9-]+-2026-10-20\.csv$/);
  });
});
