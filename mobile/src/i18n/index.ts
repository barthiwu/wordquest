import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import de from './locales/de.json';
import ar from './locales/ar.json';
import pt from './locales/pt.json';
import zh from './locales/zh.json';
import hi from './locales/hi.json';
import ru from './locales/ru.json';
import sw from './locales/sw.json';
import fa from './locales/fa.json';

/**
 * WordQuest's UI-translation rollout (Sept 2026). One JSON file per
 * language (not one per namespace per language) deliberately -- Metro
 * and TypeScript need static imports for JSON, so this keeps the
 * import list here at exactly 11 (one per LANGUAGES entry) instead of
 * ballooning to (namespace count) x (language count) as more screens
 * migrate. Each file nests every namespace as a top-level key; the
 * `ns` list below is just those top-level keys named explicitly so
 * `useTranslation('screenName')` can address one without the others.
 *
 * Scope (confirmed with Barth, Sept 2026): UI chrome only -- screen
 * titles, buttons, labels, form copy. Two things are deliberately NOT
 * covered here:
 *  - ALI's curated quick-reaction phrase pools (aliMagpieShapes.ts and
 *    friends) -- those are hand-tuned voice/personality content, out
 *    of scope for mechanical translation.
 *  - The legal document BODIES in constants/privacyPolicy.ts,
 *    termsOfService.ts, and ageRestriction.ts -- kept in English only.
 *    Translating binding legal text well enough to actually rely on
 *    normally calls for professional/certified translation, and a
 *    mistranslated clause there risks real legal exposure; only the
 *    chrome AROUND those documents (screen titles, "Last updated:",
 *    back buttons) is in scope. Flagged explicitly, not silently
 *    skipped.
 *
 * Namespaces are added here incrementally as screens migrate -- see
 * each namespace's key file for which screens it backs. Not every
 * namespace this app will eventually have exists yet.
 */
export const NAMESPACES = [
  'common',
  'welcome',
  'auth',
  'onboarding',
  'clans',
  'home',
  'settings',
  'leaderboards',
  'bossBattle',
  'masterChallenge',
  'journey',
  'passport',
  'wordMastery',
  'levelRoadmap',
  'skills',
  'quests',
  'questComplete',
  'dailyQuest',
  'wordInTheWild',
  'submitEvidence',
  'evidenceResult',
  'questCards',
  'achievements',
  'learningProfile',
  'wordPractice',
  'ali',
  'notifications',
  'order',
  'shop',
  'legal',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

const resources = {
  en: { ...en },
  fr: { ...fr },
  es: { ...es },
  de: { ...de },
  ar: { ...ar },
  pt: { ...pt },
  zh: { ...zh },
  hi: { ...hi },
  ru: { ...ru },
  sw: { ...sw },
  fa: { ...fa },
};

let initialized = false;

/**
 * Initializes i18next once, at app boot (see AppProviders), with the
 * player's already-hydrated language code (languageStore) so the very
 * first render is in the right language -- never a flash of English
 * followed by a re-render. Safe to call more than once; only the first
 * call does anything.
 */
export function initI18n(languageCode: string): typeof i18n {
  if (initialized) return i18n;
  initialized = true;
  i18n.use(initReactI18next).init({
    resources,
    lng: languageCode,
    fallbackLng: 'en',
    ns: NAMESPACES as unknown as string[],
    defaultNS: 'common',
    interpolation: { escapeValue: false }, // React already escapes
    compatibilityJSON: 'v4',
    returnNull: false,
  });
  return i18n;
}

export default i18n;
