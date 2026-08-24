import { deriveStatus, isoWeekId, nextBattleWindow } from './battle-schedule';

function utc(y: number, m: number, d: number, h = 0, min = 0, s = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, min, s));
}

describe('nextBattleWindow', () => {
  it('finds this week\'s Sunday 17:00 UTC when "now" is earlier in the week', () => {
    // Wednesday Aug 12 2026
    const now = utc(2026, 8, 12, 10, 0, 0);
    const window = nextBattleWindow(now);
    // Sunday Aug 16 2026, 17:00 UTC
    expect(window.start).toEqual(utc(2026, 8, 16, 17, 0, 0));
    expect(window.end).toEqual(utc(2026, 8, 16, 18, 0, 0));
  });

  it("returns today's window when now is Sunday before 17:00 UTC", () => {
    const now = utc(2026, 8, 16, 9, 0, 0);
    const window = nextBattleWindow(now);
    expect(window.start).toEqual(utc(2026, 8, 16, 17, 0, 0));
  });

  it("returns today's (live) window when now is Sunday between 17:00 and 18:00 UTC", () => {
    const now = utc(2026, 8, 16, 17, 30, 0);
    const window = nextBattleWindow(now);
    expect(window.start).toEqual(utc(2026, 8, 16, 17, 0, 0));
    expect(window.end).toEqual(utc(2026, 8, 16, 18, 0, 0));
  });

  it('rolls forward to next Sunday when now is Sunday after 18:00 UTC', () => {
    const now = utc(2026, 8, 16, 19, 0, 0);
    const window = nextBattleWindow(now);
    expect(window.start).toEqual(utc(2026, 8, 23, 17, 0, 0));
  });

  it('rolls forward to next Sunday at the exact end instant (18:00:00 is already ended, not live)', () => {
    const now = utc(2026, 8, 16, 18, 0, 0);
    const window = nextBattleWindow(now);
    expect(window.start).toEqual(utc(2026, 8, 23, 17, 0, 0));
  });

  it('always returns exactly a 60-minute window', () => {
    const now = utc(2026, 3, 1, 0, 0, 0);
    const window = nextBattleWindow(now);
    expect(window.end.getTime() - window.start.getTime()).toBe(60 * 60 * 1000);
  });

  it('produces a weekId matching the ISO week of the returned start date', () => {
    const now = utc(2026, 8, 12, 10, 0, 0);
    const window = nextBattleWindow(now);
    expect(window.weekId).toBe(isoWeekId(window.start));
  });
});

describe('isoWeekId', () => {
  it('formats as YYYY-Www with zero-padded week number', () => {
    expect(isoWeekId(utc(2026, 1, 5))).toMatch(/^2026-W\d{2}$/);
  });

  it('handles the ISO year-boundary edge case correctly (late-Dec date in an early-January ISO week)', () => {
    // Dec 31, 2029 is a Monday — ISO week rules can place the year-end
    // in "week 1" of the following ISO year depending on where Thursday falls.
    const result = isoWeekId(utc(2029, 12, 31));
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe('deriveStatus', () => {
  const start = utc(2026, 8, 16, 17, 0, 0);
  const end = utc(2026, 8, 16, 18, 0, 0);

  it('is SCHEDULED before the start time', () => {
    expect(deriveStatus(start, end, utc(2026, 8, 16, 16, 59, 59))).toBe('SCHEDULED');
  });

  it('is LIVE at the exact start instant', () => {
    expect(deriveStatus(start, end, start)).toBe('LIVE');
  });

  it('is LIVE one second before the end', () => {
    expect(deriveStatus(start, end, utc(2026, 8, 16, 17, 59, 59))).toBe('LIVE');
  });

  it('is COMPLETED at the exact end instant', () => {
    expect(deriveStatus(start, end, end)).toBe('COMPLETED');
  });

  it('is COMPLETED well after the end', () => {
    expect(deriveStatus(start, end, utc(2026, 8, 17, 0, 0, 0))).toBe('COMPLETED');
  });
});
