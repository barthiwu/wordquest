import type { ArcadeGameKind } from '@/services/arcadeStatus';

/** i18n key of each Arcade game's display name. */
export const ARCADE_GAME_TITLE_KEY: Record<ArcadeGameKind, string> = {
  SCRAMBLE_QUEST: 'arcade:scrambleQuestTitle',
  WORD_DUEL: 'arcade:wordDuelTitle',
  COMPLETE_IT: 'arcade:completeItTitle',
  HANGMAN: 'arcade:hangmanTitle',
};

/** The stack route behind each game (used to map a tile to its allowance). */
export const ARCADE_ROUTE_GAME = {
  ScrambleQuest: 'SCRAMBLE_QUEST',
  WordDuel: 'WORD_DUEL',
  CompleteIt: 'COMPLETE_IT',
  Hangman: 'HANGMAN',
} as const satisfies Record<string, ArcadeGameKind>;
