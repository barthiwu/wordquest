import { countryCodeToFlagEmoji } from './countryFlag';

describe('countryCodeToFlagEmoji', () => {
  it('converts a valid ISO alpha-2 code to its flag emoji', () => {
    expect(countryCodeToFlagEmoji('NG')).toBe('🇳🇬');
    expect(countryCodeToFlagEmoji('US')).toBe('🇺🇸');
  });

  it('is case-insensitive', () => {
    expect(countryCodeToFlagEmoji('ng')).toBe('🇳🇬');
  });

  it('returns null for null/undefined/empty input', () => {
    expect(countryCodeToFlagEmoji(null)).toBeNull();
    expect(countryCodeToFlagEmoji(undefined)).toBeNull();
    expect(countryCodeToFlagEmoji('')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(countryCodeToFlagEmoji('NGA')).toBeNull();
    expect(countryCodeToFlagEmoji('1')).toBeNull();
    expect(countryCodeToFlagEmoji('N1')).toBeNull();
  });
});
