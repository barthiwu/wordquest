import { nextReviewDueAt, computeForgettingRisk, isReviewDue } from './review-schedule';

describe('review-schedule', () => {
  describe('nextReviewDueAt', () => {
    it('schedules a NEW word for review sooner than a STRONG word', () => {
      const reviewedAt = new Date('2026-01-01T00:00:00Z');
      const newDue = nextReviewDueAt('NEW', reviewedAt);
      const strongDue = nextReviewDueAt('STRONG', reviewedAt);
      expect(newDue.getTime()).toBeLessThan(strongDue.getTime());
    });

    it('schedules MASTERED furthest out', () => {
      const reviewedAt = new Date('2026-01-01T00:00:00Z');
      const strongDue = nextReviewDueAt('STRONG', reviewedAt);
      const masteredDue = nextReviewDueAt('MASTERED', reviewedAt);
      expect(masteredDue.getTime()).toBeGreaterThan(strongDue.getTime());
    });
  });

  describe('computeForgettingRisk', () => {
    it('is 0 for a word never reviewed', () => {
      expect(computeForgettingRisk(null, null)).toBe(0);
    });

    it('is near 0 immediately after review', () => {
      const lastReviewed = new Date('2026-01-01T00:00:00Z');
      const due = new Date('2026-01-08T00:00:00Z');
      const now = new Date('2026-01-01T00:00:01Z');
      expect(computeForgettingRisk(lastReviewed, due, now)).toBeCloseTo(0, 2);
    });

    it('is exactly 0.6 right at the due date', () => {
      const lastReviewed = new Date('2026-01-01T00:00:00Z');
      const due = new Date('2026-01-08T00:00:00Z');
      expect(computeForgettingRisk(lastReviewed, due, due)).toBeCloseTo(0.6, 5);
    });

    it('keeps climbing past the due date, capped at 1', () => {
      const lastReviewed = new Date('2026-01-01T00:00:00Z');
      const due = new Date('2026-01-08T00:00:00Z');
      const wayLate = new Date('2026-02-01T00:00:00Z');
      expect(computeForgettingRisk(lastReviewed, due, wayLate)).toBe(1);
    });
  });

  describe('isReviewDue', () => {
    it('is false before the due date and true at/after it', () => {
      const due = new Date('2026-01-08T00:00:00Z');
      expect(isReviewDue(due, new Date('2026-01-07T00:00:00Z'))).toBe(false);
      expect(isReviewDue(due, new Date('2026-01-08T00:00:00Z'))).toBe(true);
      expect(isReviewDue(due, new Date('2026-01-09T00:00:00Z'))).toBe(true);
    });

    it('is false when there is no due date yet', () => {
      expect(isReviewDue(null)).toBe(false);
    });
  });
});
