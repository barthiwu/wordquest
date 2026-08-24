import {
  isValidTimezone,
  resolveTimezone,
  playerLocalDate,
  playerLocalHour,
  isWithinQuietHours,
} from './timezone';

describe('timezone', () => {
  describe('isValidTimezone', () => {
    it('accepts a real IANA name', () => {
      expect(isValidTimezone('Africa/Lagos')).toBe(true);
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
    });

    it('rejects null/undefined/empty/garbage', () => {
      expect(isValidTimezone(null)).toBe(false);
      expect(isValidTimezone(undefined)).toBe(false);
      expect(isValidTimezone('')).toBe(false);
      expect(isValidTimezone('Not/AZone')).toBe(false);
    });
  });

  describe('resolveTimezone', () => {
    it('passes through a valid timezone', () => {
      expect(resolveTimezone('Africa/Lagos')).toBe('Africa/Lagos');
    });

    it('falls back to UTC for invalid input', () => {
      expect(resolveTimezone(null)).toBe('UTC');
      expect(resolveTimezone('garbage')).toBe('UTC');
    });
  });

  describe('playerLocalDate', () => {
    it('returns YYYY-MM-DD in the given timezone', () => {
      // 2026-01-01T23:30:00Z is still 2026-01-02 in UTC+1 (Africa/Lagos)
      const now = new Date('2026-01-01T23:30:00Z');
      expect(playerLocalDate('Africa/Lagos', now)).toBe('2026-01-02');
      expect(playerLocalDate('UTC', now)).toBe('2026-01-01');
    });

    it('falls back to UTC date for a null timezone', () => {
      const now = new Date('2026-01-01T12:00:00Z');
      expect(playerLocalDate(null, now)).toBe('2026-01-01');
    });

    it('handles a timezone behind UTC crossing to the previous day', () => {
      // 2026-01-01T02:00:00Z is still 2025-12-31 in America/Los_Angeles (UTC-8 in January)
      const now = new Date('2026-01-01T02:00:00Z');
      expect(playerLocalDate('America/Los_Angeles', now)).toBe('2025-12-31');
    });
  });

  describe('playerLocalHour', () => {
    it('returns the local hour, not the UTC hour', () => {
      const now = new Date('2026-06-15T23:00:00Z'); // Lagos is UTC+1 year-round
      expect(playerLocalHour('Africa/Lagos', now)).toBe(0);
      expect(playerLocalHour('UTC', now)).toBe(23);
    });
  });

  describe('isWithinQuietHours', () => {
    it('handles a same-day window', () => {
      const now = new Date('2026-06-15T10:00:00Z'); // UTC hour 10
      expect(isWithinQuietHours('UTC', 9, 17, now)).toBe(true);
      expect(isWithinQuietHours('UTC', 11, 17, now)).toBe(false);
    });

    it('handles a window that wraps past midnight', () => {
      const late = new Date('2026-06-15T23:00:00Z');
      const early = new Date('2026-06-15T05:00:00Z');
      const midday = new Date('2026-06-15T12:00:00Z');
      expect(isWithinQuietHours('UTC', 22, 7, late)).toBe(true);
      expect(isWithinQuietHours('UTC', 22, 7, early)).toBe(true);
      expect(isWithinQuietHours('UTC', 22, 7, midday)).toBe(false);
    });

    it('is false when either bound is unset', () => {
      expect(isWithinQuietHours('UTC', null, 7)).toBe(false);
      expect(isWithinQuietHours('UTC', 22, null)).toBe(false);
      expect(isWithinQuietHours('UTC', undefined, undefined)).toBe(false);
    });

    it('treats a zero-width window as no quiet hours', () => {
      expect(isWithinQuietHours('UTC', 9, 9)).toBe(false);
    });
  });
});
