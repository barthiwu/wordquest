import { WordDifficulty } from '@prisma/client';
import { RewardEngineService } from './reward-engine.service';

describe('RewardEngineService', () => {
  const engine = new RewardEngineService();

  it('matches the spec §4 worked example exactly (50 base × 1.00 speed × 0.85 one-hint × 1.50 five-streak = 63.75 → 64 XP)', () => {
    const result = engine.calculate({
      difficulty: WordDifficulty.ADVANCED, // base 50
      responseTimeMs: 15_000, // exactly half of a 30s limit -> NORMAL speed (1.0)
      timeLimitMs: 30_000,
      hintsUsed: 1,
      streakBefore: 5, // +50% -> 1.5x
    });
    expect(result.baseXp).toBe(50);
    expect(result.speedModifier).toBe(1.0);
    expect(result.hintModifier).toBeCloseTo(0.85);
    expect(result.streakModifier).toBeCloseTo(1.5);
    expect(result.finalXp).toBe(64);
  });

  it.each([
    [WordDifficulty.BEGINNER, 30],
    [WordDifficulty.INTERMEDIATE, 40],
    [WordDifficulty.ADVANCED, 50],
  ])('base XP for %s is %d', (difficulty, expected) => {
    const result = engine.calculate({
      difficulty,
      responseTimeMs: 15_000,
      timeLimitMs: 30_000,
      hintsUsed: 0,
      streakBefore: 0,
    });
    expect(result.baseXp).toBe(expected);
  });

  describe('speed modifier', () => {
    it('rewards the first third of the time limit as FAST (1.2x)', () => {
      const result = engine.calculate({
        difficulty: WordDifficulty.BEGINNER,
        responseTimeMs: 5_000,
        timeLimitMs: 30_000,
        hintsUsed: 0,
        streakBefore: 0,
      });
      expect(result.speedModifier).toBe(1.2);
    });

    it('treats the middle third as NORMAL (1.0x)', () => {
      const result = engine.calculate({
        difficulty: WordDifficulty.BEGINNER,
        responseTimeMs: 15_000,
        timeLimitMs: 30_000,
        hintsUsed: 0,
        streakBefore: 0,
      });
      expect(result.speedModifier).toBe(1.0);
    });

    it('penalizes the final third as SLOW (0.9x)', () => {
      const result = engine.calculate({
        difficulty: WordDifficulty.BEGINNER,
        responseTimeMs: 29_000,
        timeLimitMs: 30_000,
        hintsUsed: 0,
        streakBefore: 0,
      });
      expect(result.speedModifier).toBe(0.9);
    });
  });

  describe('hint modifier', () => {
    it('applies no penalty with zero hints', () => {
      const result = engine.calculate({
        difficulty: WordDifficulty.BEGINNER,
        responseTimeMs: 15_000,
        timeLimitMs: 30_000,
        hintsUsed: 0,
        streakBefore: 0,
      });
      expect(result.hintModifier).toBe(1);
    });

    it('compounds multiplicatively across multiple hints (2 hints = 0.85^2)', () => {
      const result = engine.calculate({
        difficulty: WordDifficulty.BEGINNER,
        responseTimeMs: 15_000,
        timeLimitMs: 30_000,
        hintsUsed: 2,
        streakBefore: 0,
      });
      expect(result.hintModifier).toBeCloseTo(0.85 * 0.85);
    });

    it('compounds across 3 hints (0.85^3)', () => {
      const result = engine.calculate({
        difficulty: WordDifficulty.BEGINNER,
        responseTimeMs: 15_000,
        timeLimitMs: 30_000,
        hintsUsed: 3,
        streakBefore: 0,
      });
      expect(result.hintModifier).toBeCloseTo(0.85 ** 3);
    });
  });

  describe('streak modifier', () => {
    it.each([
      [0, 1.0],
      [1, 1.1],
      [2, 1.2],
      [5, 1.5],
      [10, 2.0],
    ])('streakBefore=%d -> modifier %f', (streakBefore, expected) => {
      const result = engine.calculate({
        difficulty: WordDifficulty.BEGINNER,
        responseTimeMs: 15_000,
        timeLimitMs: 30_000,
        hintsUsed: 0,
        streakBefore,
      });
      expect(result.streakModifier).toBeCloseTo(expected);
    });

    it('caps the bonus at +100% for streaks of 10 or more (never exceeds 2.0x)', () => {
      const at10 = engine.calculate({
        difficulty: WordDifficulty.BEGINNER,
        responseTimeMs: 15_000,
        timeLimitMs: 30_000,
        hintsUsed: 0,
        streakBefore: 10,
      });
      const at25 = engine.calculate({
        difficulty: WordDifficulty.BEGINNER,
        responseTimeMs: 15_000,
        timeLimitMs: 30_000,
        hintsUsed: 0,
        streakBefore: 25,
      });
      expect(at10.streakModifier).toBeCloseTo(2.0);
      expect(at25.streakModifier).toBeCloseTo(2.0);
      expect(at25.streakModifier).toBe(at10.streakModifier);
    });

    it('never produces a modifier below 1.0 even for a negative streak input', () => {
      const result = engine.calculate({
        difficulty: WordDifficulty.BEGINNER,
        responseTimeMs: 15_000,
        timeLimitMs: 30_000,
        hintsUsed: 0,
        streakBefore: -3,
      });
      expect(result.streakModifier).toBe(1.0);
    });
  });

  it('rounds the final result to the nearest integer, once, at the end', () => {
    const result = engine.calculate({
      difficulty: WordDifficulty.INTERMEDIATE, // 40
      responseTimeMs: 15_000, // NORMAL -> 1.0
      timeLimitMs: 30_000,
      hintsUsed: 1, // 0.85
      streakBefore: 3, // 1.3
    });
    // 40 * 1.0 * 0.85 * 1.3 = 44.2 -> 44
    expect(result.finalXp).toBe(44);
    expect(Number.isInteger(result.finalXp)).toBe(true);
  });
});
