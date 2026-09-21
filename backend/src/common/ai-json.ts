/**
 * Strips a wrapping ```json ... ``` (or bare ``` ... ```) markdown code
 * fence from an AI text response, if present, before JSON.parse'ing it.
 *
 * Every AI-evaluated feature (sentence/paragraph scoring, Word in the
 * Wild evidence, Master Challenge, ALI) prompts Claude for raw JSON and
 * gets it correctly almost every time — but Claude will still sometimes
 * wrap the JSON in a markdown fence anyway, a well-known LLM habit that
 * has nothing to do with whether the JSON content itself is right. Used
 * to fail the entire evaluation on that formatting alone; stripping the
 * fence here (once, centrally) fixes it everywhere instead of leaving
 * each call site to hit the same bug on its own eventually.
 */
export function stripJsonCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}
