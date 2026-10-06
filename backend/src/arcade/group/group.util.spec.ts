import {
  generateGroupCode,
  GROUP_CODE_ALPHABET,
  GroupSide,
  normalizeGroupCode,
  rankGroup,
  wordStats,
} from './group.util';

const side = (
  userId: string,
  state: GroupSide['state'],
  correct: number,
  timeMs: number,
  answered = correct,
): GroupSide => ({ userId, state, correct, answered, timeMs });

describe('group codes', () => {
  it('is the requested length and uses only the unambiguous alphabet', () => {
    const code = generateGroupCode(10);
    expect(code).toHaveLength(10);
    for (const ch of code) expect(GROUP_CODE_ALPHABET).toContain(ch);
  });

  it('has no look-alike characters in the alphabet', () => {
    for (const bad of ['0', 'O', '1', 'I', 'L']) expect(GROUP_CODE_ALPHABET).not.toContain(bad);
    expect(GROUP_CODE_ALPHABET).toHaveLength(31);
  });

  it('draws every character from the supplied picker', () => {
    expect(generateGroupCode(3, () => 0)).toBe('AAA');
    expect(generateGroupCode(2, (max) => max - 1)).toBe('99');
  });

  it('normalises case, spaces and dashes', () => {
    expect(normalizeGroupCode(' abcd-efgh jk ', 10)).toBe('ABCDEFGHJK');
  });

  it('rejects the wrong length, look-alike characters and empty input', () => {
    expect(normalizeGroupCode('ABC', 10)).toBeNull();
    expect(normalizeGroupCode('ABCDEFGH0K', 10)).toBeNull();
    expect(normalizeGroupCode('', 10)).toBeNull();
    expect(normalizeGroupCode(undefined, 10)).toBeNull();
    expect(normalizeGroupCode(null, 10)).toBeNull();
  });
});

describe('rankGroup', () => {
  it('orders by correct answers, highest first', () => {
    const r = rankGroup([
      side('a', 'FINISHED', 5, 100),
      side('b', 'FINISHED', 9, 900),
      side('c', 'FINISHED', 7, 50),
    ]);
    expect(r.map((x) => x.userId)).toEqual(['b', 'c', 'a']);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
  });

  it('breaks a tie on correct by finishing, then by lower total time', () => {
    const r = rankGroup([
      side('slow', 'FINISHED', 8, 9000),
      side('fast', 'FINISHED', 8, 4000),
      side('still', 'PLAYING', 8, 1000, 8),
    ]);
    expect(r.map((x) => x.userId)).toEqual(['fast', 'slow', 'still']);
  });

  it('gives exact ties the same rank and skips the next one', () => {
    const r = rankGroup([
      side('a', 'FINISHED', 9, 1000),
      side('b', 'FINISHED', 9, 1000),
      side('c', 'FINISHED', 3, 500),
    ]);
    expect(r.map((x) => x.rank)).toEqual([1, 1, 3]);
  });

  it('lists people who have not started last, unranked, in the order given', () => {
    const r = rankGroup([
      side('idle1', 'NOT_STARTED', 0, 0, 0),
      side('a', 'PLAYING', 1, 100),
      side('idle2', 'NOT_STARTED', 0, 0, 0),
    ]);
    expect(r.map((x) => x.userId)).toEqual(['a', 'idle1', 'idle2']);
    expect(r.map((x) => x.rank)).toEqual([1, null, null]);
  });

  it('copes with an empty group', () => {
    expect(rankGroup([])).toEqual([]);
  });
});

describe('wordStats', () => {
  it('counts attempts and correct answers per word, in play order', () => {
    const stats = wordStats(
      ['w0', 'w1', 'w2'],
      [
        { wordIndex: 0, isCorrect: true },
        { wordIndex: 0, isCorrect: false },
        { wordIndex: 1, isCorrect: false },
      ],
    );
    expect(stats).toEqual([
      { wordIndex: 0, wordId: 'w0', attempts: 2, correct: 1 },
      { wordIndex: 1, wordId: 'w1', attempts: 1, correct: 0 },
      { wordIndex: 2, wordId: 'w2', attempts: 0, correct: 0 },
    ]);
  });

  it('ignores answers for an index outside the word list', () => {
    expect(wordStats(['w0'], [{ wordIndex: 5, isCorrect: true }])[0].attempts).toBe(0);
  });
});
