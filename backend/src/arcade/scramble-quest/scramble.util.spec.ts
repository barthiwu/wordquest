import { hintRevealOrder, scrambleWord } from './scramble.util';

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

describe('hintRevealOrder', () => {
  it('returns a permutation of every position except the last letter', () => {
    const order = hintRevealOrder('training', 'session-1:0:hints');
    expect(order.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(order).not.toContain('training'.length - 1);
  });

  it('is deterministic for the same word + seed', () => {
    const a = hintRevealOrder('vocabulary', 'session-abc:3:hints');
    const b = hintRevealOrder('vocabulary', 'session-abc:3:hints');
    expect(a).toEqual(b);
  });

  it('produces different orders for different seeds', () => {
    const a = hintRevealOrder('vocabulary', 'session-abc:3:hints');
    const b = hintRevealOrder('vocabulary', 'session-abc:4:hints');
    expect(a).not.toEqual(b);
  });

  it('is not simply sequential (varies from left-to-right across seeds)', () => {
    const sequentialCount = Array.from({ length: 30 }, (_, i) =>
      hintRevealOrder('compassion', `seed-${i}`),
    ).filter((order) => order.every((pos, idx) => pos === idx)).length;
    // Left-to-right order should be rare, not the norm, across many seeds.
    expect(sequentialCount).toBeLessThan(5);
  });

  it('handles words with 0 or 1 eligible positions without erroring', () => {
    expect(hintRevealOrder('a', 'seed')).toEqual([]);
    expect(hintRevealOrder('ab', 'seed')).toEqual([0]);
  });
});
