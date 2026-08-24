import {
  CITY_STAGE_KEY,
  JOURNEY_STAGES,
  KINGDOM_STAGE_KEY,
  hasReachedCityStage,
  hasReachedKingdomStage,
  journeyStageForProgress,
} from './journey-stages';

describe('journeyStageForProgress', () => {
  it('starts at Forest (stage 0) with no level/mastery progress', () => {
    expect(journeyStageForProgress(1, 0)).toBe(0);
  });

  it('requires BOTH level and mastered words to clear a stage — level alone is not enough', () => {
    // Hamlet needs level 6 AND 50 mastered words.
    expect(journeyStageForProgress(6, 0)).toBe(0); // level cleared, words not
    expect(journeyStageForProgress(1, 50)).toBe(0); // words cleared, level not
    expect(journeyStageForProgress(6, 50)).toBe(1); // both cleared -> Hamlet
  });

  it('reaches every one of the nine stages at its exact documented dual threshold', () => {
    JOURNEY_STAGES.forEach((def) => {
      expect(journeyStageForProgress(def.minLevel, def.requiredMasteredWords)).toBe(def.stage);
    });
  });

  it('never returns a stage beyond Legend, even for enormous progress', () => {
    const maxStage = JOURNEY_STAGES[JOURNEY_STAGES.length - 1].stage;
    expect(journeyStageForProgress(100, 1_000_000)).toBe(maxStage);
  });

  it('has exactly nine stages, in the authoritative documented order (spec §2/§3.3)', () => {
    expect(JOURNEY_STAGES.map((s) => s.key)).toEqual([
      'forest',
      'hamlet',
      'village',
      'mountain',
      'castle',
      'city',
      'town',
      'kingdom',
      'legend',
    ]);
  });

  it('has strictly increasing level and mastered-word requirements at every stage', () => {
    for (let i = 1; i < JOURNEY_STAGES.length; i++) {
      expect(JOURNEY_STAGES[i].minLevel).toBeGreaterThan(JOURNEY_STAGES[i - 1].minLevel);
      expect(JOURNEY_STAGES[i].requiredMasteredWords).toBeGreaterThan(
        JOURNEY_STAGES[i - 1].requiredMasteredWords,
      );
    }
  });
});

describe('journey stage identity (spec §2.1)', () => {
  it('gives every stage a primary title and a color identity', () => {
    JOURNEY_STAGES.forEach((def) => {
      expect(def.primaryTitle.length).toBeGreaterThan(0);
      expect(def.colorIdentity.length).toBeGreaterThan(0);
    });
  });

  it('matches the documented titles exactly', () => {
    const titleByKey = Object.fromEntries(JOURNEY_STAGES.map((s) => [s.key, s.primaryTitle]));
    expect(titleByKey.forest).toBe('The Seeker');
    expect(titleByKey.legend).toBe('The Word Legend');
    expect(titleByKey.kingdom).toBe('The Luminary');
  });
});

describe('hasReachedCityStage', () => {
  it('is false below the City stage', () => {
    const village = JOURNEY_STAGES.find((s) => s.key === 'village')!;
    expect(hasReachedCityStage(village.stage)).toBe(false);
  });

  it('is true at exactly City, and at every stage beyond it', () => {
    const city = JOURNEY_STAGES.find((s) => s.key === CITY_STAGE_KEY)!;
    expect(hasReachedCityStage(city.stage)).toBe(true);
    const legend = JOURNEY_STAGES.find((s) => s.key === 'legend')!;
    expect(hasReachedCityStage(legend.stage)).toBe(true);
  });
});

describe('hasReachedKingdomStage', () => {
  it('is false below Kingdom, true at Kingdom and beyond', () => {
    const town = JOURNEY_STAGES.find((s) => s.key === 'town')!;
    const kingdom = JOURNEY_STAGES.find((s) => s.key === KINGDOM_STAGE_KEY)!;
    expect(hasReachedKingdomStage(town.stage)).toBe(false);
    expect(hasReachedKingdomStage(kingdom.stage)).toBe(true);
  });
});
