import { calculateAge, isValidPastDate } from './age';

describe('calculateAge', () => {
  const asOf = new Date('2026-09-21T12:00:00Z');

  it('returns 13 on the exact 13th birthday', () => {
    expect(calculateAge(new Date('2013-09-21T00:00:00Z'), asOf)).toBe(13);
  });

  it('returns 12 the day before the 13th birthday', () => {
    expect(calculateAge(new Date('2013-09-22T00:00:00Z'), asOf)).toBe(12);
  });

  it('returns 13 the day after the 13th birthday', () => {
    expect(calculateAge(new Date('2013-09-20T00:00:00Z'), asOf)).toBe(13);
  });

  it('handles a birth month later in the year than the current month', () => {
    expect(calculateAge(new Date('2013-12-01T00:00:00Z'), asOf)).toBe(12);
  });

  it('handles a birth month earlier in the year than the current month', () => {
    expect(calculateAge(new Date('2013-01-01T00:00:00Z'), asOf)).toBe(13);
  });
});

describe('isValidPastDate', () => {
  const asOf = new Date('2026-09-21T12:00:00Z');

  it('accepts a date in the past', () => {
    expect(isValidPastDate(new Date('2013-09-21T00:00:00Z'), asOf)).toBe(true);
  });

  it('rejects a date in the future', () => {
    expect(isValidPastDate(new Date('2026-09-22T00:00:00Z'), asOf)).toBe(false);
  });

  it('rejects an unparsable date', () => {
    expect(isValidPastDate(new Date('not-a-date'), asOf)).toBe(false);
  });
});
