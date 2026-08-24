import {
  scoreWordForSelection,
  rankCandidatesForSelection,
  type RankableWord,
  type MasteryForRanking,
} from './word-ranking';

function word(overrides: Partial<RankableWord> = {}): RankableWord {
  return {
    id: 'w1',
    cefrLevel: null,
    category: null,
    difficultyScore: null,
    baseDifficulty: 'BEGINNER',
    ...overrides,
  };
}

/** Previous-encounters fields default to "never presented" unless a test cares about them. */
function mastery(overrides: Partial<MasteryForRanking> = {}): MasteryForRanking {
  return {
    currentLevel: 'NEW',
    lastReviewedAt: null,
    nextReviewDueAt: null,
    timesPresented: 0,
    timesCorrect: 0,
    timesIncorrect: 0,
    ...overrides,
  };
}

const baseCtx = {
  currentDifficulty: 'BEGINNER' as const,
  estimatedCefrLevel: null,
  masteryByWordId: new Map(),
  masteredCountByCategory: new Map(),
  categoryPerformanceByCategory: new Map(),
};

describe('scoreWordForSelection', () => {
  it('scores a never-presented word higher than one just reviewed and not yet due', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const neverPresented = word({ id: 'a' });
    const justReviewed = word({ id: 'b' });
    const ctx = {
      ...baseCtx,
      masteryByWordId: new Map([
        [
          'b',
          mastery({
            lastReviewedAt: now,
            nextReviewDueAt: new Date('2026-06-05T00:00:00Z'),
          }),
        ],
      ]),
    };

    expect(scoreWordForSelection(neverPresented, ctx, now)).toBeGreaterThan(
      scoreWordForSelection(justReviewed, ctx, now),
    );
  });

  it('scores a review-due word higher than one not yet due', () => {
    const now = new Date('2026-06-10T00:00:00Z');
    const due = word({ id: 'a' });
    const notDue = word({ id: 'b' });
    const ctx = {
      ...baseCtx,
      masteryByWordId: new Map([
        [
          'a',
          mastery({
            lastReviewedAt: new Date('2026-06-01'),
            nextReviewDueAt: new Date('2026-06-05'),
          }),
        ],
        [
          'b',
          mastery({
            lastReviewedAt: new Date('2026-06-09'),
            nextReviewDueAt: new Date('2026-06-20'),
          }),
        ],
      ]),
    };

    expect(scoreWordForSelection(due, ctx, now)).toBeGreaterThan(
      scoreWordForSelection(notDue, ctx, now),
    );
  });

  it('heavily deprioritizes a STRONG word relative to an equivalent NEW one', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const strong = word({ id: 'a' });
    const fresh = word({ id: 'b' });
    const ctx = {
      ...baseCtx,
      masteryByWordId: new Map([
        [
          'a',
          mastery({
            currentLevel: 'STRONG',
            lastReviewedAt: now,
            nextReviewDueAt: new Date('2026-07-01'),
          }),
        ],
      ]),
    };

    expect(scoreWordForSelection(strong, ctx, now)).toBeLessThan(
      scoreWordForSelection(fresh, ctx, now),
    );
  });

  it('does not penalize a word with no CEFR/difficulty enrichment — neutral contribution, not exclusion', () => {
    const now = new Date();
    const unenriched = word({ id: 'a', cefrLevel: null, difficultyScore: null });
    expect(() => scoreWordForSelection(unenriched, baseCtx, now)).not.toThrow();
    expect(Number.isFinite(scoreWordForSelection(unenriched, baseCtx, now))).toBe(true);
  });

  it("favors CEFR proximity — a word at the player's exact level scores higher than a far one", () => {
    const now = new Date();
    const close = word({ id: 'a', cefrLevel: 'A2' });
    const far = word({ id: 'b', cefrLevel: 'C2' });
    const ctx = { ...baseCtx, currentDifficulty: 'BEGINNER' as const }; // BEGINNER midpoint ~A2

    expect(scoreWordForSelection(close, ctx, now)).toBeGreaterThan(
      scoreWordForSelection(far, ctx, now),
    );
  });

  it('favors an under-explored category over a saturated one', () => {
    const now = new Date();
    const underExplored = word({ id: 'a', category: 'Nature' });
    const saturated = word({ id: 'b', category: 'Emotion' });
    const ctx = {
      ...baseCtx,
      masteredCountByCategory: new Map([
        ['Emotion', 40],
        ['Nature', 1],
      ]),
    };

    expect(scoreWordForSelection(underExplored, ctx, now)).toBeGreaterThan(
      scoreWordForSelection(saturated, ctx, now),
    );
  });

  describe('category performance (V20 Beta Release Checklist §3)', () => {
    it('scores a word in a category the player struggles with higher than an equally-scheduled word in a strong category', () => {
      const now = new Date();
      const weakCategoryWord = word({ id: 'a', category: 'Grammar' });
      const strongCategoryWord = word({ id: 'b', category: 'Nature' });
      const ctx = {
        ...baseCtx,
        categoryPerformanceByCategory: new Map([
          ['Grammar', 0.8],
          ['Nature', 0.1],
        ]),
      };

      expect(scoreWordForSelection(weakCategoryWord, ctx, now)).toBeGreaterThan(
        scoreWordForSelection(strongCategoryWord, ctx, now),
      );
    });

    it('is independent of category variety — a well-mastered but error-prone category still scores as weak', () => {
      const now = new Date();
      const errorProneButMastered = word({ id: 'a', category: 'Grammar' });
      const ctx = {
        ...baseCtx,
        // Heavily mastered (variety signal says "saturated") but a high
        // incorrect rate (performance signal says "struggling") — the two
        // signals must be able to disagree.
        masteredCountByCategory: new Map([['Grammar', 40]]),
        categoryPerformanceByCategory: new Map([['Grammar', 0.8]]),
      };
      const ctxNoWeakness = {
        ...baseCtx,
        masteredCountByCategory: new Map([['Grammar', 40]]),
      };

      expect(scoreWordForSelection(errorProneButMastered, ctx, now)).toBeGreaterThan(
        scoreWordForSelection(errorProneButMastered, ctxNoWeakness, now),
      );
    });

    it('contributes nothing for a category absent from the map (e.g. below the minimum sample size, per words.service.ts)', () => {
      const now = new Date();
      const unmeasuredCategory = word({ id: 'a', category: 'Business' });
      const ctxWithUnrelatedEntry = {
        ...baseCtx,
        categoryPerformanceByCategory: new Map([['Nature', 0.9]]),
      };

      // 'Business' has no entry in either map — an unrelated category's
      // recorded weakness must not leak into it.
      expect(scoreWordForSelection(unmeasuredCategory, baseCtx, now)).toBe(
        scoreWordForSelection(unmeasuredCategory, ctxWithUnrelatedEntry, now),
      );
    });
  });

  describe('previous encounters (V19 Stabilization Spec §3)', () => {
    it('scores a word the player frequently gets wrong higher than an equally-scheduled word they usually get right', () => {
      const now = new Date('2026-06-01T00:00:00Z');
      const struggler = word({ id: 'a' });
      const reliable = word({ id: 'b' });
      const sameSchedule = {
        lastReviewedAt: new Date('2026-05-25'),
        nextReviewDueAt: new Date('2026-07-01'), // not due for either — isolates the struggle signal
      };
      const ctx = {
        ...baseCtx,
        masteryByWordId: new Map([
          [
            'a',
            mastery({ ...sameSchedule, timesPresented: 10, timesCorrect: 2, timesIncorrect: 8 }),
          ],
          [
            'b',
            mastery({ ...sameSchedule, timesPresented: 10, timesCorrect: 9, timesIncorrect: 1 }),
          ],
        ]),
      };

      expect(scoreWordForSelection(struggler, ctx, now)).toBeGreaterThan(
        scoreWordForSelection(reliable, ctx, now),
      );
    });

    it('ignores the struggle signal below the minimum sample size, so one unlucky miss does not outweigh an identical schedule', () => {
      const now = new Date('2026-06-01T00:00:00Z');
      const oneMiss = word({ id: 'a' });
      const oneHit = word({ id: 'b' });
      const sameSchedule = {
        lastReviewedAt: new Date('2026-05-25'),
        nextReviewDueAt: new Date('2026-07-01'), // identical, not-due schedule for both
      };
      const ctx = {
        ...baseCtx,
        masteryByWordId: new Map([
          [
            'a',
            mastery({ ...sameSchedule, timesPresented: 1, timesCorrect: 0, timesIncorrect: 1 }),
          ],
          [
            'b',
            mastery({ ...sameSchedule, timesPresented: 1, timesCorrect: 1, timesIncorrect: 0 }),
          ],
        ]),
      };

      // Below the n=2 sample-size floor, the struggle signal is suppressed
      // entirely, so a single miss/hit shouldn't move the score at all.
      expect(scoreWordForSelection(oneMiss, ctx, now)).toBe(
        scoreWordForSelection(oneHit, ctx, now),
      );
    });
  });
});

describe('rankCandidatesForSelection', () => {
  it('sorts best-first and is deterministic for equal scores (tie-broken by id)', () => {
    const now = new Date();
    const words = [word({ id: 'z' }), word({ id: 'a' }), word({ id: 'm' })];
    const ranked = rankCandidatesForSelection(words, baseCtx, now);
    expect(ranked.map((w) => w.id)).toEqual(['a', 'm', 'z']); // all equal score -> id order
  });

  it('puts a review-due word ahead of a not-due one', () => {
    const now = new Date('2026-06-10T00:00:00Z');
    const due = word({ id: 'due' });
    const notDue = word({ id: 'notdue' });
    const ctx = {
      ...baseCtx,
      masteryByWordId: new Map([
        [
          'due',
          mastery({
            lastReviewedAt: new Date('2026-06-01'),
            nextReviewDueAt: new Date('2026-06-05'),
          }),
        ],
        [
          'notdue',
          mastery({
            lastReviewedAt: new Date('2026-06-09'),
            nextReviewDueAt: new Date('2026-06-20'),
          }),
        ],
      ]),
    };

    const ranked = rankCandidatesForSelection([notDue, due], ctx, now);
    expect(ranked[0].id).toBe('due');
  });
});
