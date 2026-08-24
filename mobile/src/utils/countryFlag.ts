/**
 * Converts an ISO 3166-1 alpha-2 country code (e.g. "NG", "US") into its
 * flag emoji by mapping each letter to a Unicode Regional Indicator
 * Symbol — no image asset or flag library needed, and it covers every
 * ISO country code uniformly rather than a hand-picked subset.
 */
export function countryCodeToFlagEmoji(countryCode: string | null | undefined): string | null {
  if (!countryCode || countryCode.length !== 2) return null;
  const code = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;

  const REGIONAL_INDICATOR_OFFSET = 127397; // 0x1F1E6 ('🇦') - 'A'.charCodeAt(0)
  const chars = [...code].map((c) => c.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET);
  return String.fromCodePoint(...chars);
}
