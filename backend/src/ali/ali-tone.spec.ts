import { aliToneForJourneyStage, aliToneModifiers } from './ali-tone';

describe('aliToneForJourneyStage', () => {
  it('matches every documented stage range exactly (spec §4.4)', () => {
    expect(aliToneForJourneyStage(0)).toBe('Warm, encouraging, lightly playful'); // Forest
    expect(aliToneForJourneyStage(1)).toBe('Friendly, playful, confidence-building'); // Hamlet
    expect(aliToneForJourneyStage(2)).toBe('Friendly, playful, confidence-building'); // Village
    expect(aliToneForJourneyStage(3)).toBe('Witty, more direct, encouraging challenge'); // Mountain
    expect(aliToneForJourneyStage(4)).toBe('Witty, more direct, encouraging challenge'); // Castle
    expect(aliToneForJourneyStage(5)).toBe('Confident, humorous, playful banter'); // City
    expect(aliToneForJourneyStage(6)).toBe('Confident, humorous, playful banter'); // Town
    expect(aliToneForJourneyStage(7)).toBe('Sharp, witty, prestigious companion'); // Kingdom
    expect(aliToneForJourneyStage(8)).toBe('Confident, legendary, playful challenge; never cruel'); // Legend
  });

  it('never returns the Legend tone before Legend, and never falls back below Forest', () => {
    expect(aliToneForJourneyStage(-1)).toBe('Warm, encouraging, lightly playful');
    expect(aliToneForJourneyStage(6)).not.toBe(
      'Confident, legendary, playful challenge; never cruel',
    );
  });
});

describe('aliToneModifiers', () => {
  it('returns no modifiers when there are no notable signals', () => {
    expect(aliToneModifiers({})).toEqual([]);
    expect(aliToneModifiers({ currentStreak: 2, weaknessAreas: [] })).toEqual([]);
  });

  it('calls out a streak of 7 days or more, but not below that', () => {
    expect(aliToneModifiers({ currentStreak: 6 })).toEqual([]);
    expect(aliToneModifiers({ currentStreak: 7 })[0]).toContain('7-day streak');
  });

  it('names the specific weak areas without editorializing them as failures', () => {
    const modifiers = aliToneModifiers({
      weaknessAreas: ['context', 'sentence construction'],
    });
    expect(modifiers[0]).toContain('context, sentence construction');
    expect(modifiers[0]).toContain('never critical');
  });

  it('adds an Advanced-difficulty modifier only at Advanced', () => {
    expect(aliToneModifiers({ currentDifficulty: 'INTERMEDIATE' })).toEqual([]);
    expect(aliToneModifiers({ currentDifficulty: 'ADVANCED' })[0]).toContain('Advanced difficulty');
  });

  it('combines every applicable modifier', () => {
    const modifiers = aliToneModifiers({
      currentStreak: 10,
      weaknessAreas: ['guessing'],
      currentDifficulty: 'ADVANCED',
    });
    expect(modifiers).toHaveLength(3);
  });
});
