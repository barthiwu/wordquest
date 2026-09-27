import { blankSentence, isCompleteItSentenceUsable } from './complete-it.util';

describe('blankSentence', () => {
  it('blanks a plain occurrence of the word', () => {
    const result = blankSentence('The weather was extremely humid today.', 'humid');
    expect(result.found).toBe(true);
    expect(result.sentenceWithBlank).toBe('The weather was extremely _____ today.');
  });

  it('matches case-insensitively but preserves the rest of the sentence', () => {
    const result = blankSentence('Humid air makes summer feel worse.', 'humid');
    expect(result.found).toBe(true);
    expect(result.sentenceWithBlank).toBe('_____ air makes summer feel worse.');
  });

  it('sizes the blank to the word length', () => {
    const result = blankSentence('She showed great compassion.', 'compassion');
    expect(result.sentenceWithBlank).toContain('_'.repeat('compassion'.length));
  });

  it('only blanks the first whole-word occurrence, leaving a repeat untouched', () => {
    const result = blankSentence('Run, just run, as fast as you can.', 'run');
    expect(result.found).toBe(true);
    expect(result.sentenceWithBlank).toBe('___, just run, as fast as you can.');
  });

  it('does not match a substring inside a longer word', () => {
    const result = blankSentence('The runner trained every day.', 'run');
    expect(result.found).toBe(false);
    expect(result.sentenceWithBlank).toBe('The runner trained every day.');
  });

  it('returns found:false and the original sentence when the word is absent entirely', () => {
    const result = blankSentence('This sentence forgot its own word.', 'compassion');
    expect(result.found).toBe(false);
    expect(result.sentenceWithBlank).toBe('This sentence forgot its own word.');
  });

  it('escapes regex-special characters in the word safely', () => {
    const result = blankSentence("Don't forget the apostrophe.", "Don't");
    expect(result.found).toBe(true);
    expect(result.sentenceWithBlank).toBe('_____ forget the apostrophe.');
  });
});

describe('isCompleteItSentenceUsable', () => {
  it('accepts a sentence that contains the word and reads like real prose', () => {
    expect(isCompleteItSentenceUsable('I need to train every single day.', 'train')).toBe(true);
  });

  it('rejects a sentence that does not contain the word at all', () => {
    expect(isCompleteItSentenceUsable('This sentence forgot its own word.', 'compassion')).toBe(
      false,
    );
  });

  it('rejects a terse WordNet-style fragment even though it contains the word', () => {
    expect(isCompleteItSentenceUsable('Tenderize meat.', 'tenderize')).toBe(false);
  });

  it('accepts a sentence right at the minimum word-count floor', () => {
    // Exactly MIN_SENTENCE_WORDS (6) words.
    expect(isCompleteItSentenceUsable('The humid air felt very heavy.', 'humid')).toBe(true);
  });

  it('rejects a sentence one word short of the floor', () => {
    // 5 words.
    expect(isCompleteItSentenceUsable('The humid air felt heavy.', 'humid')).toBe(false);
  });
});
