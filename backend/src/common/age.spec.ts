import { calculateAge, getAgeRange, isValidPastDate } from './age';

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

describe('getAgeRange', () => {
  const asOf = new Date('2026-09-21T12:00:00Z');

  it('buckets an under-13 date of birth as UNDER_13', () => {
    expect(getAgeRange(new Date('2015-01-01T00:00:00Z'), asOf)).toBe('UNDER_13');
  });

  it('buckets ages 13-18 as TEENS_13_18, including both boundaries', () => {
    expect(getAgeRange(new Date('2013-09-21T00:00:00Z'), asOf)).toBe('TEENS_13_18'); // exactly 13
    expect(getAgeRange(new Date('2008-09-21T00:00:00Z'), asOf)).toBe('TEENS_13_18'); // exactly 18
  });

  it('buckets ages 19-24 as YOUNG_ADULT_19_24, including both boundaries', () => {
    expect(getAgeRange(new Date('2007-09-21T00:00:00Z'), asOf)).toBe('YOUNG_ADULT_19_24'); // exactly 19
    expect(getAgeRange(new Date('2002-09-21T00:00:00Z'), asOf)).toBe('YOUNG_ADULT_19_24'); // exactly 24
  });

  it('buckets 25 and older as ADULT_25_PLUS', () => {
    expect(getAgeRange(new Date('2001-09-21T00:00:00Z'), asOf)).toBe('ADULT_25_PLUS'); // exactly 25
    expect(getAgeRange(new Date('1970-01-01T00:00:00Z'), asOf)).toBe('ADULT_25_PLUS');
  });
});
