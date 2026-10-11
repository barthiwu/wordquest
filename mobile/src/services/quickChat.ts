/**
 * Quick chat: one-tap emoji reactions during a challenge. The server only
 * accepts these CODES (never free text), so they need no language filter and
 * are safe with strangers. Each code has an emoji here and a label in every
 * locale under `arcade:chat.quick.<CODE>`. Keep in sync with the backend's
 * arcade/chat/quick-chat.ts.
 */
export const QUICK_CHAT: readonly { code: string; emoji: string }[] = [
  { code: 'GOOD_LUCK', emoji: '🍀' },
  { code: 'GOOD_GAME', emoji: '🤝' },
  { code: 'NICE', emoji: '👏' },
  { code: 'WOW', emoji: '😮' },
  { code: 'FIRE', emoji: '🔥' },
  { code: 'LAUGH', emoji: '😂' },
  { code: 'OUCH', emoji: '😅' },
  { code: 'THINKING', emoji: '🤔' },
  { code: 'HURRY', emoji: '⏱️' },
  { code: 'REMATCH', emoji: '🔁' },
];

const EMOJI_BY_CODE = new Map(QUICK_CHAT.map((q) => [q.code, q.emoji]));

export function quickChatEmoji(code: string): string {
  return EMOJI_BY_CODE.get(code) ?? '💬';
}

/** One chat message, the same shape for Word Duel and head-to-head challenges. */
export interface ChatMessage {
  id: string;
  /** Polling cursor: the highest seq seen so far. */
  seq: number;
  senderId: string;
  /** True when this player wrote it. */
  mine: boolean;
  /** TEXT: `body` is the message. QUICK: `body` is a quick-chat code. */
  kind: 'TEXT' | 'QUICK';
  body: string;
  createdAt: string;
}

/** What a player sends: typed text, or a quick-chat code. */
export type ChatInput = { body: string } | { quick: string };
