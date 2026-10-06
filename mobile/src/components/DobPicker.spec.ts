import { localDayToUtcMidnight, utcMidnightToLocalDay } from './DobPicker';

jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

describe('DobPicker day conversion', () => {
  it('keeps the picked calendar day regardless of the device timezone', () => {
    // 1 Mar 2000 as the OS picker returns it: local midnight.
    const picked = new Date(2000, 2, 1, 0, 0, 0);
    const utc = localDayToUtcMidnight(picked);
    expect(utc.toISOString()).toBe('2000-03-01T00:00:00.000Z');
  });

  it('round-trips a UTC-midnight date back to the same local day', () => {
    const utc = new Date(Date.UTC(1999, 11, 31));
    const local = utcMidnightToLocalDay(utc);
    expect([local.getFullYear(), local.getMonth(), local.getDate()]).toEqual([1999, 11, 31]);
  });
});
