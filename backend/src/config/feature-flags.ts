/**
 * Server-side feature flags, read from the environment at call time so a
 * Railway variable change plus restart is all it takes to flip one.
 *
 * WORD_IN_THE_WILD_ENABLED: Word in the Wild is parked for V2 (WordQuest+).
 * The module, tables and photo-cleanup cron all stay in place; only the
 * public routes and the Daily Quest's optional-stage mission creation are
 * switched off. Set to "true" to bring it back.
 */
export function isWordInTheWildEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WORD_IN_THE_WILD_ENABLED === 'true';
}
