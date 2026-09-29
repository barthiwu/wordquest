/**
 * The controlled vocabulary of analytics event names (Telemetry spec
 * §6/§7-§16). One canonical name per thing that happened — never a
 * random ad-hoc string built inline at the call site. Add new names
 * here first, then reference the constant from wherever the event is
 * fired; TypeScript will catch any call site that drifts.
 *
 * Legacy names already live in the database from before this file
 * existed (quest_completed, account_created, shop_purchase,
 * boss_battle_joined — see analytics.service.ts's class doc comment)
 * and are intentionally kept lower_snake_case here rather than renamed,
 * since renaming would silently split one event's history in two.
 */
export const ANALYTICS_EVENT_NAMES = [
  // ── Legacy (pre-dating this spec; kept as-is, see file doc comment) ──
  'account_created',
  'quest_completed',
  'boss_battle_joined',
  'shop_purchase',

  // ── Session (spec §7) ──
  'SESSION_STARTED',
  'SESSION_ENDED',
  'APP_OPENED',

  // ── Onboarding (spec §8) ──
  'ONBOARDING_STARTED',
  'ONBOARDING_COMPLETED',
  'ONBOARDING_ABANDONED',

  // ── Daily Quest (spec §9) ──
  'QUEST_VIEWED',
  'QUEST_STARTED',
  'WORD_PRESENTED',
  'GUESS_SUBMITTED',
  'GUESS_RESULT',
  'SENTENCE_STARTED',
  'SENTENCE_SUBMITTED',
  'PARAGRAPH_STARTED',
  'PARAGRAPH_SUBMITTED',
  'QUEST_COMPLETED',
  'QUEST_ABANDONED',

  // ── Master Challenge (spec §10) ──
  'MASTER_CHALLENGE_VIEWED',
  'MASTER_CHALLENGE_STARTED',
  'MASTER_CHALLENGE_COMPLETED',
  'MASTER_CHALLENGE_ABANDONED',

  // ── Arcade (spec §11) ──
  'ARCADE_OPENED',
  'ARCADE_GAME_SELECTED',
  'ARCADE_SESSION_STARTED',
  'ARCADE_ANSWER_SUBMITTED',
  'ARCADE_SESSION_COMPLETED',
  'ARCADE_SESSION_ABANDONED',

  // ── Word Duel (spec §12 — highest priority, actively being redesigned) ──
  'DUEL_VIEWED',
  'DUEL_STARTED',
  'DUEL_WORD_PRESENTED',
  'DUEL_CLUE_USED',
  'DUEL_LOCK_IN',
  'DUEL_ANSWER_RESULT',
  'DUEL_WORD_COMPLETED',
  'DUEL_COMPLETED',
  'DUEL_ABANDONED',

  // ── Progression (spec §14) ──
  'XP_AWARDED',
  'LEVEL_UP',
  'JOURNEY_ADVANCED',
  'ACHIEVEMENT_UNLOCKED',
  'QUEST_CARD_EARNED',
  'STREAK_MILESTONE',
  'STREAK_BROKEN',
  'MASTERY_ACHIEVED',

  // ── ALI (spec §15) ──
  'ALI_WELCOME_SHOWN',
  'ALI_REACTION_SHOWN',
  'ALI_DIALOGUE_SHOWN',
  'ALI_MAJOR_ANIMATION_SHOWN',
  'ALI_INTERACTION',
  'ALI_SKIPPED',

  // ── Errors & abandonment (spec §16) ──
  'GAMEPLAY_ERROR',
  'API_ERROR',
  'SCREEN_ERROR',

  // ── Feedback prompts (spec §18) ──
  'FEEDBACK_PROMPT_SHOWN',
  'FEEDBACK_PROMPT_ANSWERED',

  // ── Generic client interaction (spec §4B) ──
  'SCREEN_VIEWED',
  'CLUE_BUTTON_PRESSED',
  'LOCK_IN_PRESSED',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

const EVENT_NAME_SET: ReadonlySet<string> = new Set(ANALYTICS_EVENT_NAMES);

export function isKnownAnalyticsEventName(name: string): name is AnalyticsEventName {
  return EVENT_NAME_SET.has(name);
}
