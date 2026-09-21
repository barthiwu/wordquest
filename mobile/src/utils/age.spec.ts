import { MINIMUM_AGE_YEARS, calculateAge, isValidCalendarDate, toIsoDate } from './age';

describe('isValidCalendarDate', () => {
  it('accepts a real date', () => {
    expect(isValidCalendarDate(2013, 9, 21)).toBe(true);
  });

  it('rejects Feb 30', () => {
    expect(isValidCalendarDate(2013, 2, 30)).toBe(false);
  });

  it('rejects month 13', () => {
    expect(isValidCalendarDate(2013, 13, 1)).toBe(false);
  });

  it('rejects a non-integer', () => {
    expect(isValidCalendarDate(2013.5, 1, 1)).toBe(false);
  });
});

describe('calculateAge', () => {
  const asOf = new Date('2026-09-21T12:00:00Z');

  it('returns 13 on the exact 13th birthday', () => {
    expect(calculateAge(2013, 9, 21, asOf)).toBe(13);
  });

  it('returns 12 the day before the 13th birthday', () => {
    expect(calculateAge(2013, 9, 22, asOf)).toBe(12);
  });

  it(`matches MINIMUM_AGE_YEARS's own boundary`, () => {
    expect(calculateAge(2013, 9, 21, asOf)).toBe(MINIMUM_AGE_YEARS);
  });
});

describe('toIsoDate', () => {
  it('zero-pads month and day', () => {
    expect(toIsoDate(2013, 9, 5)).toBe('2013-09-05');
  });

  it('leaves a two-digit month/day alone', () => {
    expect(toIsoDate(2013, 12, 25)).toBe('2013-12-25');
  });
});
