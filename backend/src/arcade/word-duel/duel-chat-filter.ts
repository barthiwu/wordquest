import { WORD_DUEL_CHAT_CONFIG } from '../config/arcade.config';

/**
 * Pure text checks for Word Duel chat. Opponents are matched at random and
 * can be young, so the rules are deliberately strict and simple: no links,
 * no contact details, no profanity or slurs. A message that fails is
 * rejected with a reason the app can show; nothing is silently altered.
 */
export type ChatRejection = 'EMPTY' | 'TOO_LONG' | 'CONTACT_INFO' | 'LANGUAGE';

export type ChatCheckResult = { ok: true; body: string } | { ok: false; reason: ChatRejection };

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;

/** Cleans a raw message: unicode-normalized, control/bidi characters
 * stripped, whitespace collapsed, trimmed. */
export function normalizeChatBody(raw: string): string {
  return raw.normalize('NFKC').replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
}

const TLDS =
  'com|net|org|io|me|gg|co|ly|app|xyz|info|biz|tv|cc|ru|cn|uk|us|ng|in|link|site|online|shop|dev|ai|to|fm|ws';
const URL_LIKE = new RegExp(
  `(https?:\\/\\/|www\\.|\\b[a-z0-9-]+\\.(?:${TLDS})\\b|\\b[a-z0-9-]+\\s?(?:dot|\\(dot\\))\\s?(?:${TLDS})\\b)`,
  'i',
);
const EMAIL_LIKE = /[a-z0-9._%+-]+\s?(@|\(at\)|\[at\])\s?[a-z0-9.-]+/i;
const HANDLE_LIKE = /(^|\s)@[a-z0-9_.]{3,}/i;

/** True for links, emails, @handles, and anything with seven or more
 * digits in it (a phone number, however it is spaced). */
export function hasContactInfo(text: string): boolean {
  if (URL_LIKE.test(text) || EMAIL_LIKE.test(text) || HANDLE_LIKE.test(text)) return true;
  const digits = text.replace(/[^0-9]/g, '');
  return digits.length >= 7;
}

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  $: 's',
  '7': 't',
};

/** Words that are blocked on their own (whole token). */
const BLOCKED_WORDS = new Set([
  'ass',
  'arse',
  'asshole',
  'bastard',
  'bitch',
  'bollocks',
  'cock',
  'cunt',
  'dick',
  'dickhead',
  'fuck',
  'fucker',
  'fucking',
  'fucked',
  'motherfucker',
  'piss',
  'pussy',
  'slut',
  'whore',
  'shit',
  'shite',
  'wank',
  'wanker',
  'twat',
  'rape',
  'raped',
  'raping',
  'rapist',
  'kys',
  'kike',
  'spic',
  'chink',
  'tranny',
  'dyke',
  'coon',
  'paki',
]);

/** Blocked when a token STARTS with one of these (catches suffixed forms). */
const BLOCKED_STEMS = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fagg', 'whore', 'retard', 'wank'];

/** Multi-word phrases, checked against the letters-and-single-spaces form. */
const BLOCKED_PHRASES = ['kill yourself', 'kill your self', 'go die', 'kill urself'];

function squashRepeats(word: string): string {
  return word.replace(/(.)\1{2,}/g, '$1$1');
}

/** True when the text contains profanity, a slur, or a self-harm taunt. */
export function hasBlockedLanguage(text: string): boolean {
  const lowered = text
    .toLowerCase()
    .split('')
    .map((ch) => LEET[ch] ?? ch)
    .join('');
  const spaced = lowered.replace(/[^a-z]+/g, ' ').trim();

  if (BLOCKED_PHRASES.some((p) => ` ${spaced} `.includes(` ${p} `))) return true;

  const tokens = spaced.split(' ').filter(Boolean);
  const candidates = new Set<string>();
  tokens.forEach((t) => {
    candidates.add(t);
    candidates.add(squashRepeats(t));
    // "fuuuuck": every repeated letter collapsed to one.
    candidates.add(t.replace(/(.)\1+/g, '$1'));
  });
  // "f u c k" / "f.u.c.k": a run of single letters read as one word.
  let run = '';
  for (const t of tokens) {
    if (t.length === 1) run += t;
    else {
      if (run.length >= 3) candidates.add(run);
      run = '';
    }
  }
  if (run.length >= 3) candidates.add(run);

  for (const c of candidates) {
    if (BLOCKED_WORDS.has(c)) return true;
    if (BLOCKED_STEMS.some((stem) => c.startsWith(stem))) return true;
  }
  return false;
}

/** The single entry point: clean the message, then check it. */
export function checkChatMessage(raw: string): ChatCheckResult {
  const body = normalizeChatBody(raw);
  if (body.length === 0) return { ok: false, reason: 'EMPTY' };
  if (body.length > WORD_DUEL_CHAT_CONFIG.MAX_LENGTH) return { ok: false, reason: 'TOO_LONG' };
  if (hasContactInfo(body)) return { ok: false, reason: 'CONTACT_INFO' };
  if (hasBlockedLanguage(body)) return { ok: false, reason: 'LANGUAGE' };
  return { ok: true, body };
}

/** Player-facing explanation for each rejection. */
export const CHAT_REJECTION_MESSAGES: Record<ChatRejection, string> = {
  EMPTY: 'Type a message first.',
  TOO_LONG: `Keep messages under ${WORD_DUEL_CHAT_CONFIG.MAX_LENGTH} characters.`,
  CONTACT_INFO: "Links and contact details can't be shared in duel chat.",
  LANGUAGE: 'Please keep the chat friendly.',
};
