import { splitAliText } from './richAliText';

describe('splitAliText', () => {
  it('splits XP and Glyphs out of a sentence into typed segments', () => {
    const segments = splitAliText(
      '50 XP and 10 Glyphs richer, streak sitting at 1 and ready to grow.',
    );
    expect(segments).toEqual([
      { type: 'text', value: '50 ' },
      { type: 'xp' },
      { type: 'text', value: ' and 10 ' },
      { type: 'glyph', value: 'Glyphs' },
      { type: 'text', value: ' richer, streak sitting at 1 and ready to grow.' },
    ]);
  });

  it('is case-insensitive and normalizes "xp" casing but keeps the glyph word as written', () => {
    const segments = splitAliText('+2 xp and 1 glyph');
    expect(segments).toEqual([
      { type: 'text', value: '+2 ' },
      { type: 'xp' },
      { type: 'text', value: ' and 1 ' },
      { type: 'glyph', value: 'glyph' },
    ]);
  });

  it('matches whole words only -- does not touch "xp" or "glyph" inside other words', () => {
    const segments = splitAliText('experience points are not glyphology');
    expect(segments).toEqual([{ type: 'text', value: 'experience points are not glyphology' }]);
  });

  it('returns the plain text untouched when there is nothing to tokenize', () => {
    const segments = splitAliText('Level four, and two fresh Glyphs clinking in.');
    expect(segments).toEqual([
      { type: 'text', value: 'Level four, and two fresh ' },
      { type: 'glyph', value: 'Glyphs' },
      { type: 'text', value: ' clinking in.' },
    ]);
  });

  it('handles a token at the very start or end of the string', () => {
    expect(splitAliText('XP first')).toEqual([{ type: 'xp' }, { type: 'text', value: ' first' }]);
    expect(splitAliText('ends with Glyph')).toEqual([
      { type: 'text', value: 'ends with ' },
      { type: 'glyph', value: 'Glyph' },
    ]);
  });
});
