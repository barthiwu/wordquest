import type { ThemeColors } from '@/constants/theme';

/**
 * Palette for the illustrated "New look" (Oct 2026 UI prototype): deep
 * midnight navy surfaces, electric cyan-to-blue primary, warm parchment
 * for the "scroll" cards, gold for rewards. Same token roles as
 * ThemeColors, so when the prototype is active themeStore's
 * useThemeColors() hands this palette to EVERY screen and the whole app
 * re-skins without per-screen edits.
 */
export const protoDarkColors: ThemeColors = {
  background: '#070D1C',
  surface: '#0E1730',
  surfaceRaised: '#16233F',
  ink: '#EAF2FF',
  inkMuted: '#93A6CB',
  arcane: '#1AA7FF',
  arcaneSoft: '#6CC8FF',
  success: '#2FD08A',
  warning: '#FFB547',
  danger: '#FF6B6B',
  glyph: '#FFC93C',
  border: '#22365F',
  ringTrack: '#2B3C61',
};

export const protoLightColors: ThemeColors = {
  background: '#EAF1FB',
  surface: '#FFFFFF',
  surfaceRaised: '#F1F6FD',
  ink: '#0E1A33',
  inkMuted: '#566A8E',
  arcane: '#0A7BE0',
  arcaneSoft: '#4FA6EE',
  success: '#12935F',
  warning: '#C77700',
  danger: '#D93636',
  glyph: '#B8860B',
  border: '#B4C7E4',
  ringTrack: '#C9D5E8',
};

/** Extra prototype-only tokens that have no ThemeColors role. */
export interface ProtoExtras {
  /** Primary CTA gradient (left→right). */
  cta: [string, string];
  /** Text color on the CTA gradient. */
  ctaText: string;
  /** Parchment "scroll" card (quest intro / completion / boss header). */
  parchment: [string, string];
  parchmentInk: string;
  /** Glass panel laid over scene art. */
  glass: string;
  glassBorder: string;
  /** White speech bubble. */
  bubble: string;
  bubbleInk: string;
  /** Warm accent used for streak flames. */
  flame: string;
}

export const protoDarkExtras: ProtoExtras = {
  cta: ['#25C8FF', '#1F6BF2'],
  ctaText: '#04122B',
  parchment: ['#F3DFAE', '#DDB872'],
  parchmentInk: '#3B2A12',
  glass: 'rgba(8,16,36,0.78)',
  glassBorder: 'rgba(110,170,255,0.28)',
  bubble: '#FFFFFF',
  bubbleInk: '#0E1A33',
  flame: '#FF8A3D',
};

export const protoLightExtras: ProtoExtras = {
  cta: ['#25C8FF', '#1F6BF2'],
  ctaText: '#04122B',
  parchment: ['#FBEBC6', '#EBCB8A'],
  parchmentInk: '#42301A',
  glass: 'rgba(255,255,255,0.86)',
  glassBorder: 'rgba(40,90,170,0.22)',
  bubble: '#FFFFFF',
  bubbleInk: '#0E1A33',
  flame: '#F0701A',
};
