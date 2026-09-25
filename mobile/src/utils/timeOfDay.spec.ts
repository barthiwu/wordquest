import {
  formatLocalClock,
  localDateString,
  localIsoWeekKey,
  timeOfDayGreeting,
  timeOfDayPeriod,
} from './timeOfDay';

function atHour(hour: number, minute = 0): Date {
  const d = new Date(2026, 0, 1, hour, minute, 0);
  return d;
}

describe('timeOfDayPeriod', () => {
  it('is Morning at 00:00', () => {
    expect(timeOfDayPeriod(atHour(0))).toBe('Morning');
  });

  it('is Morning at 11:59', () => {
    expect(timeOfDayPeriod(atHour(11, 59))).toBe('Morning');
  });

  it('is Afternoon at exactly 12:00', () => {
    expect(timeOfDayPeriod(atHour(12, 0))).toBe('Afternoon');
  });

  it('is Afternoon at 15:59', () => {
    expect(timeOfDayPeriod(atHour(15, 59))).toBe('Afternoon');
  });

  it('is Evening at exactly 16:00', () => {
    expect(timeOfDayPeriod(atHour(16, 0))).toBe('Evening');
  });

  it('is Evening at 23:59', () => {
    expect(timeOfDayPeriod(atHour(23, 59))).toBe('Evening');
  });

  it('uses the device clock (Date.getHours), not UTC', () => {
    // A Date constructed from local (year, month, day, hour, ...) components
    // always reports that same hour back via getHours(), regardless of the
    // device's timezone offset — this is what makes it player-local.
    const d = atHour(9);
    expect(d.getHours()).toBe(9);
    expect(timeOfDayPeriod(d)).toBe('Morning');
  });
});

describe('timeOfDayGreeting', () => {
  it('builds a lowercase-period greeting', () => {
    expect(timeOfDayGreeting(atHour(8))).toBe('Good morning');
    expect(timeOfDayGreeting(atHour(13))).toBe('Good afternoon');
    expect(timeOfDayGreeting(atHour(20))).toBe('Good evening');
  });
});

describe('formatLocalClock', () => {
  it('formats HH:MM zero-padded, not just the hour', () => {
    expect(formatLocalClock(atHour(6, 7))).toBe('06:07');
    expect(formatLocalClock(atHour(18, 0))).toBe('18:00');
    expect(formatLocalClock(atHour(23, 59))).toBe('23:59');
  });
});

describe('localDateString', () => {
  it('formats as YYYY-MM-DD from local date components', () => {
    const d = new Date(2026, 7, 14, 23, 59); // August (month index 7) 14, 2026, 23:59 local
    expect(localDateString(d)).toBe('2026-08-14');
  });

  it('zero-pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5, 9, 0); // January 5, 2026
    expect(localDateString(d)).toBe('2026-01-05');
  });

  it('does not roll over via UTC conversion near midnight', () => {
    // A late-night local time should still report today's local date,
    // not tomorrow's UTC date the way toISOString() would for anyone
    // west of UTC.
    const d = new Date(2026, 7, 14, 23, 30);
    expect(localDateString(d)).toBe('2026-08-14');
  });
});

describe('localIsoWeekKey', () => {
  it('formats as YYYY-Www from local date components', () => {
    // Wednesday, Sept 23, 2026 falls in ISO week 39.
    const d = new Date(2026, 8, 23, 10, 0);
    expect(localIsoWeekKey(d)).toBe('2026-W39');
  });

  it('stays the same key across the week, Monday through Sunday', () => {
    const monday = new Date(2026, 8, 21, 0, 1);
    const sunday = new Date(2026, 8, 27, 23, 59);
    expect(localIsoWeekKey(monday)).toBe(localIsoWeekKey(sunday));
  });

  it('rolls to a new week key the following Monday', () => {
    const sunday = new Date(2026, 8, 27, 23, 59);
    const nextMonday = new Date(2026, 8, 28, 0, 1);
    expect(localIsoWeekKey(nextMonday)).not.toBe(localIsoWeekKey(sunday));
  });
});
