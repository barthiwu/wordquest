import { WordDifficulty } from '@prisma/client';

/**
 * Centralized Arcade scoring/config constants (spec §17: "Centralize all
 * scoring constants and formulas"). Every Arcade service reads from here —
 * nothing below should ever be duplicated or re-declared elsewhere.
 *
 * Formula (spec §4): Final XP = Base XP × Speed Modifier × Hint Modifier ×
 * Streak Modifier, rounded to the nearest integer at the end (single
 * rounding point — see RewardEngineService.calculate).
 */

/** Base XP by word difficulty, before any modifiers (spec §4). */
export const ARCADE_BASE_XP: Record<WordDifficulty, number> = {
  [WordDifficulty.BEGINNER]: 30,
  [WordDifficulty.INTERMEDIATE]: 40,
  [WordDifficulty.ADVANCED]: 50,
};

/**
 * Speed modifier tiers (2026-09 product decision — spec left exact
 * thresholds undefined). Bucketed by how much of the time limit was used:
 * first third = fast, middle third = normal, final third (or timeout,
 * handled separately as a miss) = slow.
 */
export const ARCADE_SPEED_MODIFIER = {
  FAST: 1.2, // answered within the first third of the time limit
  NORMAL: 1.0, // middle third
  SLOW: 0.9, // final third
} as const;

/**
 * Given elapsed time and the time limit for this question, return the
 * speed modifier. Used identically by ScrambleQuest, Complete It, and Word
 * Duel so "fast" means the same thing everywhere (spec §4: "one
 * centralized, configurable speed modifier").
 */
export function speedModifierFor(responseTimeMs: number, timeLimitMs: number): number {
  if (timeLimitMs <= 0) return ARCADE_SPEED_MODIFIER.NORMAL;
  const fraction = responseTimeMs / timeLimitMs;
  if (fraction <= 1 / 3) return ARCADE_SPEED_MODIFIER.FAST;
  if (fraction <= 2 / 3) return ARCADE_SPEED_MODIFIER.NORMAL;
  return ARCADE_SPEED_MODIFIER.SLOW;
}

/** Each hint multiplies that answer's XP by this factor; hints compound
 * multiplicatively (spec §4/§5: "multiple hints compound"), e.g. 2 hints =
 * 0.85² ≈ 0.7225. */
export const ARCADE_HINT_PENALTY_PER_HINT = 0.85;

export function hintModifierFor(hintsUsed: number): number {
  return Math.pow(ARCADE_HINT_PENALTY_PER_HINT, Math.max(0, hintsUsed));
}

/** Streak bonus: +10% per streak step, capped at +100% (streak 10+) —
 * spec §4: "1 streak = +10%, 2 = +20%, ... 10 = +100%. Cap at +100% after
 * 10." streakBefore is the streak count BEFORE this answer (so the first
 * correct answer in a row, streakBefore=0, gets the base 1.0 modifier —
 * the bonus applies to the streak the player is extending, not the one
 * they're about to reach). */
export const ARCADE_STREAK_BONUS_PER_STEP = 0.1;
export const ARCADE_STREAK_BONUS_CAP_STEPS = 10;

export function streakModifierFor(streakBeforeThisAnswer: number): number {
  const steps = Math.min(Math.max(0, streakBeforeThisAnswer), ARCADE_STREAK_BONUS_CAP_STEPS);
  return 1 + steps * ARCADE_STREAK_BONUS_PER_STEP;
}

// ── ScrambleQuest ─────────────────────────────────────────────────────
export const SCRAMBLE_QUEST_CONFIG = {
  TIMER_SECONDS: 30,
  MAX_HINTS_PER_WORD: 3, // each reveals the next letter, left to right
  WORDS_PER_SESSION: 20,
  // 2026-09-30 decision (Barth): reaches all the way down to the vault's
  // actual floor now, same as Complete It -- a scrambled 3-4 letter word
  // is a lighter puzzle than a longer one, but it's still a puzzle, and
  // Barth wants the shorter end of the vault in active rotation here too
  // rather than reserved for Complete It alone. Superseded the original
  // "floors at 5, too trivial below that" reasoning (see git history).
  MIN_WORD_LENGTH: 3,
  // 2026-09-30 decision (Barth): capped at 10 so Arcade never reaches
  // into the long tail of the 7+ letter vault (Daily Quest's own
  // territory -- see gameplayRules.quest.minWordLength) -- Daily Quest
  // is the one mode meant to use the vocabulary vault's full length
  // range.
  MAX_WORD_LENGTH: 10,
} as const;

// ── Complete It ────────────────────────────────────────────────────────
export const COMPLETE_IT_CONFIG = {
  // Not in the spec's own Complete It config -- only HINTS_ENABLED/
  // WORDS_PER_SESSION were -- even though speedModifierFor's doc
  // comment says the speed modifier applies "identically" across all
  // three games. Added as the same kind of 2026-09 product decision
  // ScrambleQuest's own TIMER_SECONDS already was; slightly longer
  // since Complete It gives no letters at all up front, only sentence
  // + definition context, unlike ScrambleQuest's scrambled letters.
  TIMER_SECONDS: 45,
  // 2026-09 decision (Barth): hints are now enabled here, but sized
  // differently from ScrambleQuest's flat MAX_HINTS_PER_WORD. Complete
  // It's blank gives no up-front signal of relative difficulty the way
  // a scrambled word's visible letter count does, so its hint budget
  // scales with the word itself instead: round(HINT_PERCENTAGE_OF_
  // WORD_LENGTH * the word's own letter count) -- e.g. a 5-letter word
  // gets 3 hints, a 10-letter word gets 6. See CompleteItService.
  // maxHintsFor (same "never reveal the final letter" cap ScrambleQuest
  // uses). The per-hint XP penalty is the same shared
  // ARCADE_HINT_PENALTY_PER_HINT/hintModifierFor every Arcade game
  // already uses via RewardEngineService -- nothing Complete It-
  // specific about the deduction itself, only about how many hints a
  // player gets to spend.
  HINTS_ENABLED: true,
  HINT_PERCENTAGE_OF_WORD_LENGTH: 0.6,
  WORDS_PER_SESSION: 20,
  // 2026-09 decision: reaches all the way down to the vault's actual
  // floor -- a blanked-out short word ("_at") is still a real puzzle
  // even at 3 letters. As of 2026-09-30 (Barth) every Arcade game
  // shares this same 3-letter floor -- see MIN_WORD_LENGTH on
  // SCRAMBLE_QUEST_CONFIG/WORD_DUEL_CONFIG and gameplayRules.bossBattle.
  MIN_WORD_LENGTH: 3,
  // 2026-09-30 decision (Barth): same reasoning/value as every other
  // Arcade game's MAX_WORD_LENGTH -- see SCRAMBLE_QUEST_CONFIG's comment.
  MAX_WORD_LENGTH: 10,
} as const;

// ── Hangman ────────────────────────────────────────────────────────────
export const HANGMAN_CONFIG = {
  // Six body parts (head, body, two arms, two legs): the sixth wrong
  // letter hangs the man and the word is lost.
  MAX_WRONG_GUESSES: 6,
  // A session is a run of words, like the other single-player games, so
  // one "play" of Hangman is one run of this many words.
  WORDS_PER_SESSION: 5,
  // One hint per word reveals a letter the player has not found yet. It
  // never reveals the last missing letter, and it costs XP (same shared
  // per-hint penalty every Arcade game uses) but not a body part.
  MAX_HINTS_PER_WORD: 1,
  // Denominator for the shared speed modifier only. Hangman has no
  // per-word countdown -- it is a thinking game, not a race -- so this
  // only decides whether a solve counts as fast, normal or slow.
  TIME_REFERENCE_SECONDS: 90,
  // Each wrong letter costs this fraction of the XP on a win, compounding
  // (0.9^wrong), so a clean solve beats a close escape.
  MISTAKE_PENALTY_PER_WRONG_GUESS: 0.9,
  // Same vault window as the other Arcade games: 3-10 letters. Longer
  // words are easier to hang on, shorter ones are riskier, which suits
  // a range of difficulties.
  MIN_WORD_LENGTH: 3,
  MAX_WORD_LENGTH: 10,
} as const;

// ── Word Duel ──────────────────────────────────────────────────────────
export const WORD_DUEL_CONFIG = {
  MATCH_DURATION_MINUTES: 5,
  // spec §6 recommended a 3-5 min matchmaking WAIT range before giving
  // up; 2026-09 decision deliberately undercut that for snappier UX (a
  // player who can't be paired in 30s sees a clear "no opponent found"
  // and can retry or play something else, rather than staring at a
  // spinner for minutes) -- this comment used to contradict its own
  // value ("5 min" written here next to a 30-second number); fixed to
  // describe what the code actually does.
  MATCHMAKING_TIMEOUT_SECONDS: 30,
  // A friend challenge waits longer than the random queue: the friend has
  // to see the notification and open the app. The host stays on the
  // waiting screen for this long.
  INVITE_TIMEOUT_SECONDS: 120,
  WRONG_ANSWER_LOCKOUT_MS: 0, // 2026-09 decision: streak reset only, no extra lockout
  // Word bank size for one match (mirrors SCRAMBLE_QUEST_CONFIG/
  // COMPLETE_IT_CONFIG's WORDS_PER_SESSION) -- generous relative to
  // MATCH_DURATION_MINUTES so exhausting the bank before time's up is
  // rare; a player who does just waits for the match clock to run out.
  WORDS_PER_MATCH: 20,
  // Progressive clues (spec §6): not in the spec's own Word Duel config
  // any more than Complete It's timer was -- added as a 2026-09 product
  // decision once the actual mechanic had to be implemented, then
  // revised twice since: 2026-09-29 (Barth) moved from an automatic,
  // elapsed-time reveal to a player-triggered one (a "Clues" button,
  // see WordDuelService.requestClue), and 2026-09-30 (Barth: "This
  // makes it more like a game, and less like an exam hall") replaced
  // that revision's two fixed clues (synonym, then a letter hint) with
  // five: CATEGORY, SYNONYM, FIRST_LAST (first + last letter), EXAMPLE
  // (the word's own example sentence, blanked), then LETTERS (60% of
  // the word's letters, always including the two FIRST_LAST already
  // revealed) -- see word-duel.service.ts's resolveClue/
  // revealedLetterPositions and this file's git history for the two
  // superseded designs. (A short-lived ORIGIN/etymology clue type also
  // existed briefly in the first, 2026-09-29 revision and was removed
  // the same day -- the vocabulary corpus has zero origin/etymology
  // data for any word.)
  MAX_CLUES_PER_WORD: 5,
  // The LETTERS clue (the 5th/last clue) reveals this fraction of the
  // word's letters in total, always including the two positions the
  // FIRST_LAST clue (3rd) already revealed, topped up with a
  // deterministic-random selection of the rest -- see
  // WordDuelService.revealedLetterPositions. (Renamed from
  // HINT_CLUE_LETTER_FRACTION when the old single "HINT" clue became
  // the FIRST_LAST + LETTERS pair; same 0.6 value throughout.)
  LETTERS_CLUE_LETTER_FRACTION: 0.6,
  // Denominator for speedModifierFor's fast/normal/slow bucketing only
  // -- NOT an enforced per-word timeout (WordDuelAnswer has no
  // `timedOut` column, unlike ArcadeAnswer: a word Duel player is only
  // ever cut off by the match-wide endsAt, never a per-word deadline).
  WORD_TIME_REFERENCE_SECONDS: 20,
  // 2026-09-30 decision (Barth): same 3-letter floor as every other
  // Arcade game now -- see SCRAMBLE_QUEST_CONFIG's comment (this
  // supersedes the original "needs more letters for progressive
  // clues to be worth it" reasoning that set this to 5).
  MIN_WORD_LENGTH: 3,
  // 2026-09-30 decision (Barth): same reasoning/value as every other
  // Arcade game's MAX_WORD_LENGTH -- see SCRAMBLE_QUEST_CONFIG's comment.
  MAX_WORD_LENGTH: 10,
} as const;

/** In-game chat during a Word Duel (2026-10 request). Text only, short,
 * rate-limited, and filtered: opponents can be strangers. */
export const WORD_DUEL_CHAT_CONFIG = {
  MAX_LENGTH: 200,
  // Minimum gap between one player's messages.
  MIN_INTERVAL_MS: 1500,
  MAX_MESSAGES_PER_PLAYER_PER_MATCH: 60,
  // The same text sent twice inside this window counts as spam.
  DUPLICATE_WINDOW_MS: 10_000,
  // Players can still chat ("gg") for a few minutes after the final bell.
  POST_MATCH_GRACE_MINUTES: 5,
  // Most messages one poll returns.
  FETCH_LIMIT: 50,
  // Unreported messages are deleted after this long. Reported ones are kept
  // for the moderation team.
  RETENTION_DAYS: 30,
} as const;

/**
 * Whether Arcade play counts toward the player's existing daily-activity
 * streak (UserProgression.currentStreak via ProgressionService.
 * recordDailyActivity). 2026-09 product decision: YES — this deliberately
 * overrides the spec's own §16 default suggestion ("No requirement to
 * play Arcade for Daily Quest progression"). Read by each Arcade game
 * service after a session/match completes.
 */
export const ARCADE_COUNTS_TOWARD_DAILY_STREAK = true;

/**
 * Whether Arcade wins award Glyphs in addition to XP. 2026-09 decision:
 * NO — XP only in V1, to avoid opening a second Glyph-economy surface
 * before launch (spec §16: "No separate Arcade account-level economy").
 */
export const ARCADE_AWARDS_GLYPHS = false;

/**
 * Word Duel tiebreak rule (spec §6 requires a deterministic tiebreaker).
 * 2026-09 decision: most correct answers wins; if still tied, earliest
 * timestamp at which the player reached their final total XP wins. See
 * WordDuelService.resolveMatch for the implementation and
 * WordDuelMatch.tieBreakReason for the audit trail.
 */
export const WORD_DUEL_TIEBREAK_DESCRIPTION = 'most_correct_answers_then_earliest_final_score';

// ── Head-to-head (versus) matches ──────────────────────────────────────
// ScrambleQuest, Complete It and Hangman can be played against another
// player (2026-10 request). Both players play their own ordinary session
// on the same words; the higher number of correct answers wins, faster
// total time breaks a tie. Word Duel is a different, real-time model and
// is multiplayer-only.
export const ARCADE_VERSUS_GAMES = ['SCRAMBLE_QUEST', 'COMPLETE_IT', 'HANGMAN'] as const;

export const ARCADE_VERSUS_CONFIG = {
  // How long a random-queue search waits for an opponent before the match
  // expires and the player is offered solo play instead.
  QUEUE_TIMEOUT_SECONDS: 45,
  // A friend challenge stays open this long for the friend to accept.
  INVITE_TTL_HOURS: 24,
  // Once both players are in: the longest a random match can run (the
  // slowest solo run is 20 words x 30s, so this is generous)...
  RANDOM_PLAY_WINDOW_MINUTES: 25,
  // ...and, once one player finishes, how much longer the other gets
  // before the match is settled on what they have answered so far.
  RANDOM_FINISH_GRACE_MINUTES: 6,
  // Friend matches are asynchronous: the friend may play hours later.
  FRIEND_PLAY_WINDOW_HOURS: 24,
  FRIEND_FINISH_GRACE_HOURS: 24,
  // XP bonus for winning a RANDOM match (no bonus for friend matches, so
  // two friends cannot trade wins to farm XP). Answer XP is awarded as
  // usual by each game, this is only the win bonus.
  WIN_BONUS_XP: 40,
  // Cap on open friend challenges one player can have outstanding.
  MAX_OPEN_INVITES: 5,
  // Sweep cadence is in the service (@Cron); history kept for the lists.
  RECENT_RESULTS_SHOWN: 10,
} as const;

// ── Group Play ─────────────────────────────────────────────────────────
// One host creates a private group, shares its link, and up to MAX_MEMBERS
// people play the same words in one timed round (2026-10 request). The host
// can be a teacher, but Group Play is NOT only for students: it is just as
// much for a WhatsApp game night, a family, a club. So people can join the
// link as a guest, with no account (see ArcadeGuestService), and sign up later
// if they like it. Link-only: there is no public listing. Group plays are NOT
// counted against the daily play limit, so a student who has used up their
// own plays can still join their class.
export const ARCADE_GROUP_GAMES = ['SCRAMBLE_QUEST', 'COMPLETE_IT', 'HANGMAN'] as const;

export const ARCADE_GROUP_CONFIG = {
  MAX_MEMBERS: 50,
  // An unused group (nobody started a round) lapses after this long.
  LOBBY_TTL_HOURS: 48,
  // How long a round runs once the host starts it (the host picks within the range).
  DEFAULT_WINDOW_MINUTES: 60,
  MIN_WINDOW_MINUTES: 10,
  MAX_WINDOW_MINUTES: 240,
  // Open (lobby / active) groups one host can have at once.
  MAX_OPEN_GROUPS_PER_HOST: 10,
  TITLE_MAX_LENGTH: 60,
  // Length of the secret in the invite link (about 49 bits at 31 symbols).
  CODE_LENGTH: 10,
  // Ended groups stay readable (teachers look back at results) this long.
  ENDED_RETENTION_DAYS: 180,
  // A guest (joined by link without an account) is deleted after this long, so
  // an unclaimed guest never outlives the results it appears in.
  GUEST_RETENTION_DAYS: 180,
  GUEST_NICKNAME_MIN: 2,
  GUEST_NICKNAME_MAX: 20,
} as const;

// ── Daily play limits ──────────────────────────────────────────────────
// Free plan: at most this many plays of EACH Arcade game per player-local
// day (2026-10 decision, Barth: it nudges players onto the other games and
// toward WordQuest+, which is unlimited). A play is a session / match that
// actually started; the day rolls over at the player's local midnight.
export const ARCADE_DAILY_PLAY_LIMIT = 10;

/** Share of the daily limit at which the player gets a notice, in percent. */
export const ARCADE_PLAY_LIMIT_NOTICE_PERCENTS = [50, 70, 90, 100] as const;
export type ArcadePlayLimitNoticePercent = (typeof ARCADE_PLAY_LIMIT_NOTICE_PERCENTS)[number];

/**
 * The play counts that trigger each notice, e.g. limit 10 -> 5, 7, 9, 10.
 * Rounded up so a small limit never notices early, and de-duplicated so a
 * tiny limit (say 3) still sends each distinct count once, the highest
 * percent winning.
 */
export function playLimitNoticeCounts(
  limit: number,
): { count: number; percent: ArcadePlayLimitNoticePercent }[] {
  const byCount = new Map<number, ArcadePlayLimitNoticePercent>();
  for (const percent of ARCADE_PLAY_LIMIT_NOTICE_PERCENTS) {
    const count = Math.min(limit, Math.max(1, Math.ceil((limit * percent) / 100)));
    byCount.set(count, percent);
  }
  return [...byCount.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([count, percent]) => ({ count, percent }));
}
