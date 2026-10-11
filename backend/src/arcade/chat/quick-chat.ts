/**
 * Quick chat: one-tap emoji reactions players can send during a challenge.
 * The wire value is the CODE (never free text), so quick chat needs no
 * language filtering, works with strangers, and each app shows the emoji
 * and a label in the viewer's own language. Add a code here AND its label
 * under `arcade:chat.quick.<CODE>` in the app's locale files.
 */
export const QUICK_CHAT_CODES = [
  'GOOD_LUCK',
  'GOOD_GAME',
  'NICE',
  'WOW',
  'FIRE',
  'LAUGH',
  'OUCH',
  'THINKING',
  'HURRY',
  'REMATCH',
] as const;

export type QuickChatCode = (typeof QUICK_CHAT_CODES)[number];

export function isQuickChatCode(value: unknown): value is QuickChatCode {
  return typeof value === 'string' && (QUICK_CHAT_CODES as readonly string[]).includes(value);
}
