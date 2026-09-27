import {
  toUsSpelling,
  toUsSentence,
  toUsNormalizedWord,
  UK_TO_US_WORDS,
  renderWord,
} from './english-variant';

describe('toUsSpelling', () => {
  it('returns null for words with no UK/US difference at all', () => {
    expect(toUsSpelling('adventure')).toBeNull();
    expect(toUsSpelling('confidence')).toBeNull();
    expect(toUsSpelling('beautiful')).toBeNull();
  });

  it('does not convert words that merely end in the -our/-or lookalike pattern', () => {
    expect(toUsSpelling('hour')).toBeNull();
    expect(toUsSpelling('flour')).toBeNull();
    expect(toUsSpelling('tour')).toBeNull();
    expect(toUsSpelling('your')).toBeNull();
    expect(toUsSpelling('four')).toBeNull();
    expect(toUsSpelling('detour')).toBeNull();
    expect(toUsSpelling('amour')).toBeNull();
  });

  it('does not convert words that merely end in the -re lookalike pattern', () => {
    expect(toUsSpelling('genre')).toBeNull();
    expect(toUsSpelling('ogre')).toBeNull();
    expect(toUsSpelling('acre')).toBeNull();
    expect(toUsSpelling('mediocre')).toBeNull();
    expect(toUsSpelling('macabre')).toBeNull();
    expect(toUsSpelling('cadre')).toBeNull();
  });

  it('does not convert -ise words with no real -ize alternate', () => {
    expect(toUsSpelling('advertise')).toBeNull();
    expect(toUsSpelling('surprise')).toBeNull();
    expect(toUsSpelling('exercise')).toBeNull();
    expect(toUsSpelling('promise')).toBeNull();
    expect(toUsSpelling('supervise')).toBeNull();
    expect(toUsSpelling('franchise')).toBeNull();
  });

  it('converts the -our/-or family and its common inflections', () => {
    expect(toUsSpelling('colour')).toBe('color');
    expect(toUsSpelling('colours')).toBe('colors');
    expect(toUsSpelling('coloured')).toBe('colored');
    expect(toUsSpelling('colouring')).toBe('coloring');
    expect(toUsSpelling('colourful')).toBe('colorful');
    expect(toUsSpelling('favourite')).toBe('favorite');
    expect(toUsSpelling('neighbourhood')).toBe('neighborhood');
    expect(toUsSpelling('honour')).toBe('honor');
  });

  it('converts the -re/-er family', () => {
    expect(toUsSpelling('centre')).toBe('center');
    expect(toUsSpelling('centred')).toBe('centered');
    expect(toUsSpelling('theatre')).toBe('theater');
    expect(toUsSpelling('litre')).toBe('liter');
  });

  it('converts curated -ise/-ize verbs and their inflections', () => {
    expect(toUsSpelling('realise')).toBe('realize');
    expect(toUsSpelling('realises')).toBe('realizes');
    expect(toUsSpelling('realised')).toBe('realized');
    expect(toUsSpelling('realising')).toBe('realizing');
    expect(toUsSpelling('organise')).toBe('organize');
    expect(toUsSpelling('organisation')).toBe('organization');
  });

  it('converts -yse/-yze verbs but leaves the ambiguous plural noun "analyses" alone', () => {
    expect(toUsSpelling('analyse')).toBe('analyze');
    expect(toUsSpelling('analysed')).toBe('analyzed');
    expect(toUsSpelling('analyses')).toBeNull();
  });

  it('converts -ce/-se noun/verb pairs correctly, including the licence/license split', () => {
    expect(toUsSpelling('defence')).toBe('defense');
    expect(toUsSpelling('licence')).toBe('license');
    expect(toUsSpelling('license')).toBeNull(); // already identical in both
    expect(toUsSpelling('practise')).toBe('practice');
    expect(toUsSpelling('practice')).toBeNull(); // already identical in both
  });

  it('converts doubled-consonant verb inflections without touching the unchanged base form', () => {
    expect(toUsSpelling('travelled')).toBe('traveled');
    expect(toUsSpelling('travelling')).toBe('traveling');
    expect(toUsSpelling('traveller')).toBe('traveler');
    expect(toUsSpelling('travel')).toBeNull(); // base form is identical in both
    expect(toUsSpelling('enrol')).toBe('enroll'); // reverse direction: UK single -> US double
  });

  it('converts the well-known one-off irregular pairs', () => {
    expect(toUsSpelling('tyre')).toBe('tire');
    expect(toUsSpelling('grey')).toBe('gray');
    expect(toUsSpelling('aluminium')).toBe('aluminum');
    expect(toUsSpelling('mould')).toBe('mold');
    expect(toUsSpelling('sceptic')).toBe('skeptic');
  });

  it('preserves Title-Case capitalization the way this corpus authors headwords', () => {
    expect(toUsSpelling('Colour')).toBe('Color');
    expect(toUsSpelling('Centre')).toBe('Center');
    expect(toUsSpelling('Grey')).toBe('Gray');
  });

  it('matches case-insensitively regardless of casing', () => {
    expect(toUsSpelling('COLOUR')).toBe('Color'); // first-letter rule: only the first char's case is honored
  });

  it('every table entry actually differs from its key (no accidental no-op pairs)', () => {
    for (const [uk, us] of UK_TO_US_WORDS) {
      expect(us).not.toBe(uk);
    }
  });
});

describe('toUsNormalizedWord', () => {
  it('returns the lowercase US form when one exists', () => {
    expect(toUsNormalizedWord('Colour')).toBe('color');
    expect(toUsNormalizedWord('CENTRE')).toBe('center');
  });

  it('returns null when there is no distinct US form', () => {
    expect(toUsNormalizedWord('Adventure')).toBeNull();
  });
});

describe('toUsSentence', () => {
  it('converts every convertible word in a sentence, leaving the rest untouched', () => {
    expect(toUsSentence('The colour of the theatre was a favourite topic.')).toBe(
      'The color of the theater was a favorite topic.',
    );
  });

  it('leaves a sentence with no convertible words completely unchanged', () => {
    const sentence = 'They set off on an adventure through the mountains.';
    expect(toUsSentence(sentence)).toBe(sentence);
  });

  it('does not touch punctuation, numbers, or spacing', () => {
    expect(toUsSentence("It's a colour, isn't it? 100% sure.")).toBe(
      "It's a color, isn't it? 100% sure.",
    );
  });

  it('preserves a capitalized sentence-initial word', () => {
    expect(toUsSentence('Colour theory is fascinating.')).toBe('Color theory is fascinating.');
  });
});

describe('renderWord', () => {
  const colourWord = {
    word: 'Colour',
    normalizedWord: 'colour',
    exampleSentence: 'The colour of the theatre was a favourite topic.',
    wordUS: 'Color',
    normalizedWordUS: 'color',
    exampleSentenceUS: 'The color of the theater was a favorite topic.',
  };

  const adventureWord = {
    word: 'Adventure',
    normalizedWord: 'adventure',
    exampleSentence: 'They set off on an adventure through the mountains.',
    wordUS: null,
    normalizedWordUS: null,
    exampleSentenceUS: null,
  };

  // "Adventure" itself never changes, but this particular sentence
  // mentions "favourite" -- exercises the independent-nulling case.
  const adventureWithConvertibleSentence = {
    ...adventureWord,
    exampleSentence: 'Her favourite adventure was in the mountains.',
    exampleSentenceUS: 'Her favorite adventure was in the mountains.',
  };

  it('renders the UK originals for a UK preference', () => {
    expect(renderWord(colourWord, 'UK')).toEqual({
      text: 'Colour',
      normalizedText: 'colour',
      sentence: 'The colour of the theatre was a favourite topic.',
    });
  });

  it('renders the US triple for a US preference when one exists', () => {
    expect(renderWord(colourWord, 'US')).toEqual({
      text: 'Color',
      normalizedText: 'color',
      sentence: 'The color of the theater was a favorite topic.',
    });
  });

  it('falls back to UK for a null/undefined preference (never asked yet)', () => {
    expect(renderWord(colourWord, null)).toEqual({
      text: 'Colour',
      normalizedText: 'colour',
      sentence: 'The colour of the theatre was a favourite topic.',
    });
    expect(renderWord(colourWord, undefined)).toEqual({
      text: 'Colour',
      normalizedText: 'colour',
      sentence: 'The colour of the theatre was a favourite topic.',
    });
  });

  it('falls back to the UK word/sentence when a US preference exists but this word has no US form', () => {
    expect(renderWord(adventureWord, 'US')).toEqual({
      text: 'Adventure',
      normalizedText: 'adventure',
      sentence: 'They set off on an adventure through the mountains.',
    });
  });

  it('converts the sentence for a US preference even when the headword itself has no US form', () => {
    expect(renderWord(adventureWithConvertibleSentence, 'US')).toEqual({
      text: 'Adventure', // headword unchanged
      normalizedText: 'adventure',
      sentence: 'Her favorite adventure was in the mountains.', // sentence still converts
    });
  });
});
