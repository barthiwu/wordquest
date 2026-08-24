import { quickAliReaction } from './ali-quick-reactions';

describe('quickAliReaction', () => {
  it('always returns a non-empty string for a correct answer', () => {
    for (let i = 0; i < 20; i++) {
      const reaction = quickAliReaction(true);
      expect(typeof reaction).toBe('string');
      expect(reaction.length).toBeGreaterThan(0);
    }
  });

  it('always returns a non-empty string for a wrong answer', () => {
    for (let i = 0; i < 20; i++) {
      const reaction = quickAliReaction(false);
      expect(typeof reaction).toBe('string');
      expect(reaction.length).toBeGreaterThan(0);
    }
  });

  it('never uses shaming or discouraging language in the wrong-answer pool', () => {
    const banned = ['wrong', 'fail', 'bad', 'stupid', 'never', "can't", 'loser'];
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(quickAliReaction(false));
    }
    for (const phrase of seen) {
      const lower = phrase.toLowerCase();
      for (const word of banned) {
        expect(lower).not.toContain(word);
      }
    }
  });

  it('draws from more than one phrase (not a single hardcoded string)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      seen.add(quickAliReaction(true));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
