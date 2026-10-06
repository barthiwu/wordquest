/**
 * Build-time feature flags for the mobile app.
 *
 * wordInTheWild: parked for V2 (WordQuest+). The screens, services and the
 * backend module stay in the repo so V2 can switch them back on, but with
 * this off nothing in the app links to them: the Journey button is gone and
 * the Daily Quest goes straight from Paragraph to Word Complete. The backend
 * mirrors this with WORD_IN_THE_WILD_ENABLED (default off).
 */
export const FEATURES = {
  wordInTheWild: false,
} as const;
