import {
  distinctLetters,
  evaluateGuesses,
  foldLetter,
  isValidGuess,
  pickHintLetter,
} from './hangman.util';

describe('hangman.util', () => {
  describe('foldLetter', () => {
    it('lower-cases and strips accents', () => {
      expect(foldLetter('A')).toBe('a');
      expect(foldLetter('é')).toBe('e');
    });
    it('returns empty for non-letters', () => {
      expect(foldLetter('-')).toBe('');
      expect(foldLetter(' ')).toBe('');
      expect(foldLetter("'")).toBe('');
      expect(foldLetter('7')).toBe('');
    });
  });

  it('accepts only a single a-z guess', () => {
    expect(isValidGuess('a')).toBe(true);
    expect(isValidGuess('Z')).toBe(true);
    expect(isValidGuess('ab')).toBe(false);
    expect(isValidGuess('')).toBe(false);
    expect(isValidGuess('1')).toBe(false);
    expect(isValidGuess('é')).toBe(false);
  });

  it('collects distinct folded letters', () => {
    expect([...distinctLetters("Café-au'lait")].sort()).toEqual([
      'a',
      'c',
      'e',
      'f',
      'i',
      'l',
      't',
      'u',
    ]);
  });

  describe('evaluateGuesses', () => {
    it('hides every letter before any guess, but shows punctuation', () => {
      const s = evaluateGuesses('ice-cream', [], 6);
      expect(s.pattern).toBe('___-_____');
      expect(s.won).toBe(false);
      expect(s.lost).toBe(false);
    });

    it('reveals every occurrence of a correct guess', () => {
      const s = evaluateGuesses('banana', ['a'], 6);
      expect(s.pattern).toBe('_a_a_a');
      expect(s.wrongCount).toBe(0);
    });

    it('counts wrong letters in guess order', () => {
      const s = evaluateGuesses('train', ['z', 't', 'q'], 6);
      expect(s.wrongLetters).toEqual(['z', 'q']);
      expect(s.wrongCount).toBe(2);
      expect(s.pattern).toBe('t____');
    });

    it('wins when every letter is found, even with mistakes along the way', () => {
      const s = evaluateGuesses('cat', ['x', 'c', 'a', 't'], 6);
      expect(s.won).toBe(true);
      expect(s.lost).toBe(false);
      expect(s.pattern).toBe('cat');
    });

    it('loses on the sixth wrong letter', () => {
      const five = evaluateGuesses('cat', ['x', 'y', 'z', 'q', 'w'], 6);
      expect(five.lost).toBe(false);
      const six = evaluateGuesses('cat', ['x', 'y', 'z', 'q', 'w', 'v'], 6);
      expect(six.lost).toBe(true);
      expect(six.won).toBe(false);
    });

    it('a win on the same guess as the last allowed mistake is a win, not a loss', () => {
      // Five wrong letters, then the final needed letter: won.
      const s = evaluateGuesses('at', ['x', 'y', 'z', 'q', 'w', 'a', 't'], 6);
      expect(s.wrongCount).toBe(5);
      expect(s.won).toBe(true);
      expect(s.lost).toBe(false);
    });

    it('lets a plain "e" find an accented "é"', () => {
      expect(evaluateGuesses('café', ['e'], 6).pattern).toBe('___é');
    });
  });

  describe('pickHintLetter', () => {
    it('picks an unguessed letter of the word, deterministically', () => {
      const a = pickHintLetter('train', ['t'], 'seed');
      const b = pickHintLetter('train', ['t'], 'seed');
      expect(a).toBe(b);
      expect(['r', 'a', 'i', 'n']).toContain(a);
    });

    it('never reveals the last missing letter', () => {
      expect(pickHintLetter('train', ['t', 'r', 'a', 'i'], 'seed')).toBeNull();
    });

    it('can still hint when only two distinct letters are missing', () => {
      expect(['i', 'n']).toContain(pickHintLetter('train', ['t', 'r', 'a'], 'seed'));
    });
  });
});
