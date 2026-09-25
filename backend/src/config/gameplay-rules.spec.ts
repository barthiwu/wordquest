import { computeGuessXp, gameplayRules } from './gameplay-rules';
import type { AgeRange } from '../common/age';

describe('computeGuessXp', () => {
  const clean = { wrongAttempts: 0, hintsUsed: 0, synonymsUsed: 0, lettersRevealed: 0 };
  // hintsUsed: 1 disqualifies the +500 no-hint bonus without affecting the
  // other penalty types — used to isolate time-band and other-penalty
  // behavior from the no-hint bonus's own stacking/clamping interaction.
  const oneHint = { wrongAttempts: 0, hintsUsed: 1, synonymsUsed: 0, lettersRevealed: 0 };

  describe('time bonus bands (isolated from the no-hint bonus via a single hint)', () => {
    it('gives the fastest band (750) at 0 elapsed seconds', () => {
      // 750 (band) - 50 (1 hint) = 700
      expect(computeGuessXp({ elapsedSeconds: 0, ...oneHint })).toBe(700);
    });

    it('gives the fastest band right up to its 24s boundary', () => {
      expect(computeGuessXp({ elapsedSeconds: 24, ...oneHint })).toBe(700);
    });

    it('drops to the next band just past a boundary', () => {
      // 500 (band) - 50 (1 hint) = 450
      expect(computeGuessXp({ elapsedSeconds: 25, ...oneHint })).toBe(450);
    });

    it('walks through all five bands correctly', () => {
      expect(computeGuessXp({ elapsedSeconds: 30, ...oneHint })).toBe(450); // 500 - 50
      expect(computeGuessXp({ elapsedSeconds: 60, ...oneHint })).toBe(200); // 250 - 50
      expect(computeGuessXp({ elapsedSeconds: 90, ...oneHint })).toBe(100); // 50, clamped up to the 100 floor
      expect(computeGuessXp({ elapsedSeconds: 120, ...oneHint })).toBe(100); // -50, clamped up to the 100 floor
    });

    it('treats elapsed time beyond the timer the same as the slowest band, never throws', () => {
      expect(computeGuessXp({ elapsedSeconds: 999, ...oneHint })).toBe(
        computeGuessXp({ elapsedSeconds: 120, ...oneHint }),
      );
    });
  });

  describe('no-hint bonus', () => {
    it('adds the full +500 no-hint bonus on a completely clean run', () => {
      // 0 (slowest band) + 500 (no-hint bonus) = 500
      expect(computeGuessXp({ elapsedSeconds: 120, ...clean })).toBe(500);
    });

    it('is not granted if even one hint was used', () => {
      const withHint = computeGuessXp({ elapsedSeconds: 120, ...oneHint });
      const cleanRun = computeGuessXp({ elapsedSeconds: 120, ...clean });
      expect(withHint).toBeLessThan(cleanRun);
    });

    it('is not granted if a synonym or letter reveal was used, even with zero hints', () => {
      const withSynonym = computeGuessXp({
        elapsedSeconds: 120,
        wrongAttempts: 0,
        hintsUsed: 0,
        synonymsUsed: 1,
        lettersRevealed: 0,
      });
      const withReveal = computeGuessXp({
        elapsedSeconds: 120,
        wrongAttempts: 0,
        hintsUsed: 0,
        synonymsUsed: 0,
        lettersRevealed: 1,
      });
      expect(withSynonym).toBe(gameplayRules.guessStage.participationFloor);
      expect(withReveal).toBe(gameplayRules.guessStage.participationFloor);
    });

    it("is granted regardless of wrong attempts — only hint/synonym/reveal disqualify it, per the spec's own wording", () => {
      // 0 (band) - 250 (5 wrong attempts * 50) + 500 (no-hint bonus, still earned) = 250
      const result = computeGuessXp({
        elapsedSeconds: 120,
        wrongAttempts: 5,
        hintsUsed: 0,
        synonymsUsed: 0,
        lettersRevealed: 0,
      });
      expect(result).toBe(250);
    });
  });

  describe('penalties (isolated using the fastest time band and one hint, so no-hint bonus never interferes)', () => {
    it('subtracts 50 XP per wrong attempt', () => {
      const zero = computeGuessXp({
        elapsedSeconds: 0,
        wrongAttempts: 0,
        hintsUsed: 1,
        synonymsUsed: 0,
        lettersRevealed: 0,
      });
      const two = computeGuessXp({
        elapsedSeconds: 0,
        wrongAttempts: 2,
        hintsUsed: 1,
        synonymsUsed: 0,
        lettersRevealed: 0,
      });
      expect(zero - two).toBe(100); // 2 * 50
    });

    it('subtracts 50 XP per hint, up to the documented max of 4', () => {
      const one = computeGuessXp({
        elapsedSeconds: 0,
        wrongAttempts: 0,
        hintsUsed: 1,
        synonymsUsed: 0,
        lettersRevealed: 0,
      });
      const four = computeGuessXp({
        elapsedSeconds: 0,
        wrongAttempts: 0,
        hintsUsed: 4,
        synonymsUsed: 0,
        lettersRevealed: 0,
      });
      expect(one - four).toBe(150); // 3 * 50
    });

    it('subtracts 100 XP per synonym', () => {
      const zero = computeGuessXp({
        elapsedSeconds: 0,
        wrongAttempts: 0,
        hintsUsed: 1,
        synonymsUsed: 0,
        lettersRevealed: 0,
      });
      const two = computeGuessXp({
        elapsedSeconds: 0,
        wrongAttempts: 0,
        hintsUsed: 1,
        synonymsUsed: 2,
        lettersRevealed: 0,
      });
      expect(zero - two).toBe(200); // 2 * 100
    });

    it('subtracts 150 XP per letter reveal', () => {
      const zero = computeGuessXp({
        elapsedSeconds: 0,
        wrongAttempts: 0,
        hintsUsed: 1,
        synonymsUsed: 0,
        lettersRevealed: 0,
      });
      const one = computeGuessXp({
        elapsedSeconds: 0,
        wrongAttempts: 0,
        hintsUsed: 1,
        synonymsUsed: 0,
        lettersRevealed: 1,
      });
      expect(zero - one).toBe(150);
    });
  });

  describe('clamping', () => {
    it('never exceeds the 750 maximum, even where time bonus plus no-hint bonus would exceed it uncapped', () => {
      // 750 (band) + 500 (no-hint bonus) = 1250 uncapped -> clamped to 750.
      expect(computeGuessXp({ elapsedSeconds: 0, ...clean })).toBe(750);
    });

    it('never drops below the 100 participation floor under heavy penalties', () => {
      const result = computeGuessXp({
        elapsedSeconds: 120,
        wrongAttempts: 10,
        hintsUsed: 4,
        synonymsUsed: 2,
        lettersRevealed: 3,
      });
      expect(result).toBe(100);
    });
  });

  it('is a pure function — identical inputs always produce identical output', () => {
    const input = {
      elapsedSeconds: 45,
      wrongAttempts: 1,
      hintsUsed: 1,
      synonymsUsed: 0,
      lettersRevealed: 0,
    };
    const results = new Set(Array.from({ length: 10 }, () => computeGuessXp(input)));
    expect(results.size).toBe(1);
  });
});

describe('gameplayRules.learningProfile.startingDifficultyByAgeRange', () => {
  const ALL_AGE_RANGES: AgeRange[] = [
    'UNDER_13',
    'TEENS_13_18',
    'YOUNG_ADULT_19_24',
    'ADULT_25_PLUS',
  ];

  it('is total over every AgeRange', () => {
    for (const range of ALL_AGE_RANGES) {
      expect(gameplayRules.learningProfile.startingDifficultyByAgeRange[range]).toBeDefined();
    }
  });

  it('never starts anyone at ADVANCED purely from age — that must be earned via calibration', () => {
    for (const range of ALL_AGE_RANGES) {
      expect(gameplayRules.learningProfile.startingDifficultyByAgeRange[range]).not.toBe(
        'ADVANCED',
      );
    }
  });

  it('starts younger players no higher than older players', () => {
    const order = { BEGINNER: 0, INTERMEDIATE: 1, ADVANCED: 2 } as const;
    const { startingDifficultyByAgeRange: byRange } = gameplayRules.learningProfile;
    expect(order[byRange.TEENS_13_18]).toBeLessThanOrEqual(order[byRange.YOUNG_ADULT_19_24]);
    expect(order[byRange.YOUNG_ADULT_19_24]).toBeLessThanOrEqual(order[byRange.ADULT_25_PLUS]);
  });
});
