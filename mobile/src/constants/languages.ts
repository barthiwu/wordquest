/**
 * Languages a player can pick as WordQuest's display/interface language
 * (Settings > Language). Capped at 10 by request: the world's most
 * widely spoken languages, plus two African languages beyond the
 * colonial-era ones already on that list (English, French, Portuguese)
 * — Swahili (East Africa's lingua franca, ~200M speakers) and Hausa
 * (West Africa, ~90M+ speakers) — so the list doesn't quietly treat
 * "global" as "everywhere except Africa."
 *
 * `flagCountryCode` is a representative country for the flag emoji
 * (via countryCodeToFlagEmoji) — a language isn't a country, so this is
 * a display choice, not a claim of exclusive ownership (e.g. Arabic
 * shows Saudi Arabia's flag as one widely recognized reference point
 * among the many countries where it's spoken/official).
 */
export interface Language {
  code: string; // ISO 639-1 where one exists
  name: string; // English name, shown as the primary label
  nativeName: string; // Shown alongside, so a player can spot their language at a glance
  flagCountryCode: string;
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flagCountryCode: 'US' },
  { code: 'zh', name: 'Mandarin Chinese', nativeName: '中文', flagCountryCode: 'CN' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flagCountryCode: 'ES' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flagCountryCode: 'IN' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flagCountryCode: 'SA' },
  { code: 'fr', name: 'French', nativeName: 'Français', flagCountryCode: 'FR' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flagCountryCode: 'PT' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flagCountryCode: 'RU' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', flagCountryCode: 'TZ' },
  { code: 'ha', name: 'Hausa', nativeName: 'Harshen Hausa', flagCountryCode: 'NG' },
];

export const DEFAULT_LANGUAGE_CODE = 'en';
