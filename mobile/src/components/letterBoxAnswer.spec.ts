import { boxLetters, mergeRevealedAnswer, typedAfterReveal } from './letterBoxAnswer';

const WORD = 'excitement';

/** What the boxes show, one char per box ('_' = empty). */
function boxes(typed: string, revealed: { position: number; letter: string }[], length: number) {
  return boxLetters(typed, revealed, length)
    .map((c) => c || '_')
    .join('');
}

describe('typedAfterReveal', () => {
  it('replaces the typed letter in the hint box instead of shifting letters along', () => {
    // Player typed "excet" (boxes 0-4); the hint reveals "i" in box 3.
    const reveal = { position: 3, letter: 'i' };
    const typed = typedAfterReveal('excet', [], reveal.position, WORD.length);
    expect(boxes(typed, [reveal], WORD.length)).toBe('exci' + 't' + '_____');
    // Never "exciet".
    expect(mergeRevealedAnswer(typed, [reveal], WORD.length)).not.toContain('exciet');
  });

  it('keeps later letters in their own boxes when the hint lands earlier', () => {
    const reveal = { position: 1, letter: 'x' };
    const typed = typedAfterReveal('abcd', [], reveal.position, 8);
    expect(boxes(typed, [reveal], 8)).toBe('axcd____');
  });

  it('drops the letter when the hint lands on the last typed box', () => {
    const reveal = { position: 4, letter: 't' };
    const typed = typedAfterReveal('excea', [], reveal.position, WORD.length);
    expect(boxes(typed, [reveal], WORD.length)).toBe('exce' + 't' + '_____');
  });

  it('leaves what was typed untouched when the hint lands past it', () => {
    const reveal = { position: 8, letter: 'n' };
    const typed = typedAfterReveal('exc', [], reveal.position, WORD.length);
    expect(typed).toBe('exc');
    expect(boxes(typed, [reveal], WORD.length)).toBe('exc_____n_');
  });

  it('works on top of earlier hints', () => {
    const first = { position: 0, letter: 'e' };
    // Box 0 locked; the player typed "xcet" into boxes 1-4.
    const second = { position: 3, letter: 'i' };
    const typed = typedAfterReveal('xcet', [first], second.position, WORD.length);
    expect(boxes(typed, [first, second], WORD.length)).toBe('e' + 'xc' + 'i' + 't' + '_____');
  });

  it('handles an empty answer and a hint on every box', () => {
    expect(typedAfterReveal('', [], 2, 5)).toBe('');
    const all = [0, 1, 2].map((position) => ({ position, letter: 'a' }));
    expect(typedAfterReveal('zz', all.slice(0, 2), 2, 3)).toBe('');
  });
});

describe('mergeRevealedAnswer', () => {
  it('lays typed letters over the unlocked boxes and the hints over the locked ones', () => {
    expect(mergeRevealedAnswer('exct', [{ position: 3, letter: 'i' }], 6)).toBe('excit' + '');
  });
});
