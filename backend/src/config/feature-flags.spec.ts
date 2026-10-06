import { isWordInTheWildEnabled } from './feature-flags';

describe('feature flags', () => {
  it('keeps Word in the Wild off unless explicitly enabled', () => {
    expect(isWordInTheWildEnabled({})).toBe(false);
    expect(isWordInTheWildEnabled({ WORD_IN_THE_WILD_ENABLED: 'false' })).toBe(false);
    expect(isWordInTheWildEnabled({ WORD_IN_THE_WILD_ENABLED: '1' })).toBe(false);
    expect(isWordInTheWildEnabled({ WORD_IN_THE_WILD_ENABLED: 'true' })).toBe(true);
  });
});
