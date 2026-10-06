import { formatClock } from './groupFormat';

describe('formatClock', () => {
  it('formats minutes and seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9_000)).toBe('0:09');
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(59 * 60_000 + 59_000)).toBe('59:59');
  });

  it('adds hours when needed', () => {
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatClock(2 * 3_600_000 + 5 * 60_000 + 7_000)).toBe('2:05:07');
  });

  it('never goes negative', () => {
    expect(formatClock(-5000)).toBe('0:00');
  });
});
