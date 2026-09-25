/**
 * WordQuest design-system foundation.
 *
 * Direction: a living-manuscript / illuminated-map aesthetic rather than
 * generic "game UI neon" — WordQuest is a language-learning world, and the
 * visual language should read as *crafted lore*, not decorated flashcards.
 * Ink-and-parchment structure, with a single deep "arcane" accent reserved
 * for progression moments (XP gain, mastery, Legend). Everything else stays
 * quiet so those moments read as earned rather than constant.
 *
 * These are foundation tokens only — full theming (dark mode, per-clan
 * accent variants) lands with the relevant feature modules.
 */

/**
 * The "world at night" palette — WordQuest's original and still-default
 * look. Deep dusk-indigo base, warm parchment ink, arcane purple reserved
 * for progression moments.
 */
export interface ThemeColors {
  background: string;
  surface: string;
  surfaceRaised: string;
  ink: string;
  inkMuted: string;
  arcane: string;
  arcaneSoft: string;
  success: string;
  warning: string;
  danger: string;
  glyph: string;
  border: string;
}

export const darkColors: ThemeColors = {
  // Base — parchment/ink, not pure black/white
  background: '#12102A', // deep dusk-indigo, the "world at night" base
  surface: '#1C1940',
  surfaceRaised: '#262158',
  ink: '#F4F1E8', // warm parchment-white for primary text
  inkMuted: '#B9B4D8',

  // Single arcane accent, reserved for progression/reward moments
  arcane: '#8B5CF6',
  arcaneSoft: '#C4B5FD',

  // Status
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',

  // Glyph economy accent — distinct from arcane so currency always reads
  // as currency, never as generic "success purple"
  glyph: '#F4C542',

  border: '#332D6B',
} as const;

/**
 * The "illuminated manuscript by daylight" palette — same structure and
 * role for every token as darkColors (a light surface reading as parchment
 * under sun rather than ink at dusk), so a screen that switches its
 * `colors` import for either object needs no other changes. Arcane and
 * glyph stay recognizably themselves in both modes — they're brand
 * accents, not base surfaces, so they only shift slightly for contrast.
 */
export const lightColors: ThemeColors = {
  background: '#F7F3E9', // warm parchment, the daylight mirror of the dusk base
  surface: '#FFFFFF',
  surfaceRaised: '#F1ECDD',
  ink: '#1E1B33', // deep ink-purple for primary text on parchment
  inkMuted: '#6B6489',

  // arcane stays a single confident purple reserved for the one or two
  // highest-emphasis elements per screen (primary CTA, active-progress
  // ring). arcaneSoft is used everywhere else purple shows up (links,
  // labels, badges, avatar initials) -- on a light/white background a
  // "soft" tint has to mean genuinely paler and less saturated, not just
  // a second bright purple, or every one of those small text elements
  // reads at the same visual volume as the primary action and the whole
  // screen competes for attention. (darkColors' arcaneSoft lightens
  // *toward* its near-black background for the same recede-into-the-back
  // effect; here that means lightening toward the near-white background
  // instead.)
  arcane: '#6D28D9',
  arcaneSoft: '#A78BFA',

  // Deepened slightly off pure "neon" saturation so status colors read as
  // grounded ink tones on parchment rather than competing highlighter
  // colors next to arcane/glyph.
  success: '#15803D',
  warning: '#C2410C',
  danger: '#DC2626',

  // Hue deliberately separated from `warning` (orange-red, ~17°) toward a
  // true gold (~43°) so the streak-flame pill and the Glyph-coin pill
  // don't read as the same warm color fighting for the same attention.
  glyph: '#B8860B',

  // #DDD4B8 (the first pass at this token) sat at ~1.3-1.5:1 contrast
  // against both `background` and `surface` -- reading as barely-there
  // hairlines rather than borders, so card edges, the locked Journey-path
  // circles (StagePathRail's only visual definition, no fill of their
  // own), and every other bordered control read as unpronounced on
  // parchment. Darkened along the same hue/saturation (still ~45 deg,
  // ~33% sat -- a border, not a new color) to ~2.7-3:1, in line with
  // WCAG 1.4.11's 3:1 guidance for UI component boundaries.
  border: '#A79354',
} as const;

/** Default/fallback palette for screens not yet wired to the theme
 * toggle (see state/themeStore.ts) — keeps every existing `colors.x`
 * import working exactly as before. */
export const colors = darkColors;

export const typography = {
  display: {
    fontFamily: 'System', // swap for a licensed display face during World phase
    weight: '700' as const,
  },
  body: {
    fontFamily: 'System',
    weight: '400' as const,
  },
  scale: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 28,
    xxl: 36,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const theme = { colors, typography, spacing, radius };
export type Theme = typeof theme;
