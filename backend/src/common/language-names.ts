/**
 * Display names for the languages a player can pick as their
 * native/comprehension language (mobile Settings > Language --
 * mobile/src/constants/languages.ts). Kept manually in sync with that
 * list, same pattern as country-continent.ts's own doc comment for why
 * this lives as a small hand-maintained map rather than a shared
 * package: two small apps, one list, not worth a monorepo dependency
 * for ten entries.
 *
 * Used only to give the AI prompt (AliService.buildSystemPrompt) a
 * human-readable name instead of a bare code -- an unrecognized code
 * (e.g. a future addition to the mobile list that hasn't been mirrored
 * here yet) still works, just less legibly to the model, which is why
 * languageNameForCode falls back to the raw code rather than throwing.
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  zh: 'Mandarin Chinese',
  es: 'Spanish',
  hi: 'Hindi',
  ar: 'Arabic',
  fr: 'French',
  pt: 'Portuguese',
  ru: 'Russian',
  sw: 'Swahili',
  fa: 'Farsi/Persian',
};

export function languageNameForCode(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

/**
 * Shared instruction block appended to AI system prompts (AliService,
 * and the Sentence/Paragraph/Master Challenge evaluators) so a
 * player's native/comprehension language gets the exact same promise
 * honored everywhere: the model's OWN explanatory prose switches
 * language, the actual English content of the lesson never does.
 * Centralized rather than duplicated per service so the wording can't
 * quietly drift between "ALI explains this in Spanish" and "the
 * Sentence evaluator explains this in Spanish" -- a player relying on
 * this should see one consistent behavior across the whole app.
 *
 * Returns '' (nothing to append) for no preference set or English --
 * there's nothing to switch away from.
 */
export function nativeLanguageInstruction(nativeLanguage: string | null | undefined): string {
  if (!nativeLanguage || nativeLanguage === 'en') return '';
  const name = languageNameForCode(nativeLanguage);
  return `\n\nThe player's native/comprehension language is ${name} (code: "${nativeLanguage}"). Write your own explanatory prose in ${name}, NOT English, so a player who doesn't yet read English comfortably can understand it. The one exception: any English word, sentence, or phrase that IS the lesson content (the target vocabulary word, the learner's own submitted sentence/paragraph, a quoted correction, a suggested revision) stays in English exactly as given -- never translate the content being learned, only your own prose around it.`;
}
