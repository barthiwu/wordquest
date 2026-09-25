/**
 * Languages a player can pick as WordQuest's display/interface language
 * (Settings > Language). Eleven languages: the world's most widely
 * spoken ones, ordered by Barth's product priority rather than raw
 * speaker count -- English, French, Spanish, German, Arabic and
 * Portuguese first (the app's primary target markets), then the
 * remaining languages (Mandarin, Hindi, Russian, Swahili, Farsi) after.
 * Swahili is East Africa's lingua franca (~200M speakers), included
 * beyond the colonial-era languages already on the list (English,
 * French, Portuguese) so it doesn't quietly treat "global" as
 * "everywhere except Africa". Farsi/Persian (~110M+ speakers across
 * Iran, Afghanistan and Tajikistan) was swapped in for Hausa on
 * request.
 *
 * `flagCountryCode` is a representative country for the flag emoji
 * (via countryCodeToFlagEmoji) -- a language isn't a country, so this is
 * a display choice, not a claim of exclusive ownership (e.g. Arabic
 * shows Saudi Arabia's flag as one widely recognized reference point
 * among the many countries where it's spoken/official).
 */
export interface Language {
  code: string; // ISO 639-1 where one exists
  name: string; // English name, shown as the primary label
  nativeName: string; // Shown alongside, so a player can spot their language at a glance
  flagCountryCode: string;
  /**
   * Right-to-left SCRIPT (Sept 2026 UI-translation rollout — see
   * src/i18n). Only Arabic and Farsi among these eleven. As of the
   * Sept 2026 RTL-wording revision, this drives TEXT direction/
   * alignment ONLY (src/i18n/rtlText.ts) — WordQuest's own UI layout
   * (icon positions, row direction, navigation chrome) intentionally
   * stays LTR for every language, by product decision. This never
   * triggers I18nManager.forceRTL or a native reload; see
   * src/i18n/rtlText.ts's doc comment for the full reasoning.
   */
  isRtl: boolean;
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flagCountryCode: 'US', isRtl: false },
  { code: 'fr', name: 'French', nativeName: 'Français', flagCountryCode: 'FR', isRtl: false },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flagCountryCode: 'ES', isRtl: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flagCountryCode: 'DE', isRtl: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flagCountryCode: 'SA', isRtl: true },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flagCountryCode: 'PT', isRtl: false },
  { code: 'zh', name: 'Mandarin Chinese', nativeName: '中文', flagCountryCode: 'CN', isRtl: false },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flagCountryCode: 'IN', isRtl: false },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flagCountryCode: 'RU', isRtl: false },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', flagCountryCode: 'TZ', isRtl: false },
  { code: 'fa', name: 'Farsi', nativeName: 'فارسی', flagCountryCode: 'IR', isRtl: true },
];

export const DEFAULT_LANGUAGE_CODE = 'en';
