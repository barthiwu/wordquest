/**
 * Lightweight, zero-cost reactions for the highest-frequency ALI trigger
 * the spec asks for — a correct or wrong answer on literally every guess
 * (V21 Beta Release Candidate Spec §6: "ALI must react to ... Correct
 * answers. Wrong answers."). Routing every single guess through
 * AliService.react's real Anthropic API call would multiply ALI's API
 * spend by total guess volume instead of just milestones (level-up,
 * mastery, achievements, journey, streaks, boss battle results) — a
 * genuine cost/scale concern, confirmed with the product owner rather
 * than assumed. This is a small curated set of pre-written phrases
 * instead: no AI call, no added latency, no persisted AliMessage row
 * (these are too frequent and too disposable to be "conversation
 * history" the way a milestone reaction is) — just an immediate
 * personality touch on the single most common player action in the app.
 *
 * V23: refreshed both pools to actually sound like ALI (a word-loving
 * ink-sprite, not a generic "nice job" bot — see ali.service.ts's
 * buildSystemPrompt doc comment for the character) now that these show
 * up as an actual pop-up (AliBubble) after every guess instead of
 * sitting as quiet inline text underneath the result.
 *
 * Same tone guardrails as AliService's system prompt apply here by
 * construction, not by policy: every phrase in these two pools was
 * hand-written to encourage, never to shame, mock, or discourage — there
 * is no generation step where one of these could drift out of that
 * boundary the way a model response theoretically could.
 */

const CORRECT_REACTIONS: readonly string[] = [
  'Nice one!',
  "That's exactly right.",
  "You've got this word down.",
  'Sharp — keep going.',
  'Correct! Nicely spotted.',
  "That's the one.",
  'Ooh, I like that word too.',
  'Got it in one!',
  "That's going straight in my favourites.",
  'Clean guess — well spotted.',
  'Yes! Love watching that land.',
];

const ENCOURAGING_REACTIONS: readonly string[] = [
  'Not quite — take another look.',
  'Close! Give it one more try.',
  "No worries, you'll get the next one.",
  'Not this time — try again.',
  'Almost — have another go.',
  "That's alright, keep at it.",
  "This one's a slippery word — try again.",
  "Not it, but you're circling it.",
  "Good try — one more look and it's yours.",
  "Tricky one. Take another swing.",
];

/**
 * Picks one phrase from the correct/encouraging pool. Pure aside from
 * `Math.random` — no DB, no network — safe to call on every single
 * guess without adding latency or cost.
 */
export function quickAliReaction(isCorrect: boolean): string {
  const pool = isCorrect ? CORRECT_REACTIONS : ENCOURAGING_REACTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}
