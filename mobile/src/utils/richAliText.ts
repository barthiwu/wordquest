const TOKEN_RE = /\b(glyphs?|xp)\b/gi;

export type AliTextSegment =
  { type: 'text'; value: string } | { type: 'xp' } | { type: 'glyph'; value: string };

/**
 * Splits one of ALI's reaction strings into plain-text runs and reward
 * tokens ("XP", "Glyph"/"Glyphs") -- the pure text-parsing half of
 * RichAliText.tsx, pulled out so the tokenizing logic itself is
 * unit-testable without pulling in React Native's component tree (this
 * codebase's other tests are all plain logic/service specs, not
 * component-render specs -- this keeps that pattern rather than
 * introducing a new testing setup for one component).
 *
 * Whole-word, case-insensitive; the "glyph" segment keeps the matched
 * text's own casing/plurality ("Glyph" vs "glyphs") since that's
 * whatever ALI's prose actually wrote, while "xp" is normalized to the
 * fixed "XP" label used everywhere else in the app.
 */
export function splitAliText(text: string): AliTextSegment[] {
  const parts = text.split(TOKEN_RE);
  const segments: AliTextSegment[] = [];

  parts.forEach((part, i) => {
    if (!part) return;
    // String.split with one capturing group alternates
    // [plain, match, plain, match, ...] -- odd indices are matches.
    if (i % 2 === 0) {
      segments.push({ type: 'text', value: part });
      return;
    }
    if (part.toLowerCase() === 'xp') {
      segments.push({ type: 'xp' });
      return;
    }
    segments.push({ type: 'glyph', value: part });
  });

  return segments;
}
