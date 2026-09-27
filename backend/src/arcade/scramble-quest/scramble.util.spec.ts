import { scrambleWord } from './scramble.util';

describe('scrambleWord', () => {
  it('returns a permutation of the same letters', () => {
    const result = scrambleWord('training', 'session-1:0');
    expect(result.split('').sort().join('')).toBe('training'.split('').sort().join(''));
  });

  it('never returns the original word for a word with distinct letters', () => {
    for (let i = 0; i < 20; i++) {
      const result = scrambleWord('compassion', `seed-${i}`);
      expect(result).not.toBe('compassion');
    }
  });

  it('is deterministic for the same word + seed', () => {
    const a = scrambleWord('vocabulary', 'session-abc:3');
    const b = scrambleWord('vocabulary', 'session-abc:3');
    expect(a).toBe(b);
  });

  it('produces different arrangements for different seeds', () => {
    const a = scrambleWord('vocabulary', 'session-abc:3');
    const b = scrambleWord('vocabulary', 'session-abc:4');
    expect(a).not.toBe(b);
  });

  it('returns single-letter words unchanged', () => {
    expect(scrambleWord('a', 'seed')).toBe('a');
  });

  it('handles a repeated-letter word without infinite looping', () => {
    expect(scrambleWord('aaa', 'seed').split('').sort().join('')).toBe('aaa');
  });

  it('preserves letter case', () => {
    const result = scrambleWord('Paris', 'seed-case');
    expect(result.toLowerCase().split('').sort().join('')).toBe('paris'.split('').sort().join(''));
    expect(result).toMatch(/[A-Z]/);
  });
});
