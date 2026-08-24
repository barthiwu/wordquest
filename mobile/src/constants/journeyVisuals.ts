import type { Ionicons } from '@expo/vector-icons';

export interface JourneyMotifIcon {
  icon: keyof typeof Ionicons.glyphMap;
  /** Percent offsets (0-100) within the card's absolutely-positioned overlay. */
  top: number;
  left: number;
  size: number;
  opacity: number;
  rotate?: string;
}

export interface JourneyVisual {
  /** A concrete hex rendering of journey-stages.ts's colorIdentity string (e.g. "Warm Earth" -> this hex) — the backend owns the identity name, this file owns turning it into a color mobile can actually paint with. */
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  /**
   * Two-stop diagonal wash for the stage's hero card — a muted tint of
   * the stage's identity color over the app's normal dusk-indigo
   * surface, never a loud/saturated gradient (theme.ts's "everything
   * else stays quiet" illuminated-manuscript direction; the vibrant
   * `color` above stays reserved for the icon/text accents exactly like
   * before, the gradient is texture, not a second accent).
   */
  gradient: [string, string];
  /**
   * A small scattered decorative pattern unique to this stage — Forest
   * gets drifting leaves, City gets a low skyline, Legend gets floating
   * stars, and so on — so each stage reads as a distinct *place*, not
   * just a recolored copy of the same card (task: "distinct per-stage
   * visual identity" / Correction & Completion Spec §6 "Living World
   * visuals"). Rendered at low opacity behind the card's real content;
   * purely decorative, never load-bearing information.
   */
  motif: JourneyMotifIcon[];
}

/**
 * One entry per JOURNEY_STAGES key (backend: config/journey-stages.ts).
 * Kept as a lookup keyed by stage `key` rather than index so a stage
 * reorder on the backend can't silently mis-color a stage here.
 */
export const JOURNEY_VISUALS: Record<string, JourneyVisual> = {
  forest: {
    color: '#9CA3AF',
    icon: 'leaf-outline',
    gradient: ['#1C1940', '#1F2A22'],
    motif: [
      { icon: 'leaf', top: 8, left: 78, size: 22, opacity: 0.16, rotate: '18deg' },
      { icon: 'leaf-outline', top: 30, left: 90, size: 16, opacity: 0.14, rotate: '-10deg' },
      { icon: 'leaf', top: 65, left: 82, size: 18, opacity: 0.12, rotate: '35deg' },
      { icon: 'leaf-outline', top: 78, left: 6, size: 14, opacity: 0.1, rotate: '-20deg' },
    ],
  },
  hamlet: {
    color: '#4ADE80',
    icon: 'home-outline',
    gradient: ['#1C1940', '#173322'],
    motif: [
      { icon: 'home', top: 12, left: 80, size: 20, opacity: 0.16 },
      { icon: 'flame-outline', top: 40, left: 90, size: 14, opacity: 0.14 },
      { icon: 'home-outline', top: 68, left: 84, size: 16, opacity: 0.12, rotate: '-6deg' },
    ],
  },
  village: {
    color: '#D97757',
    icon: 'storefront-outline',
    gradient: ['#1C1940', '#2E2015'],
    motif: [
      { icon: 'storefront', top: 10, left: 76, size: 20, opacity: 0.16 },
      { icon: 'basket-outline', top: 42, left: 90, size: 15, opacity: 0.14, rotate: '8deg' },
      { icon: 'storefront-outline', top: 70, left: 82, size: 16, opacity: 0.12, rotate: '-8deg' },
      { icon: 'basket-outline', top: 80, left: 8, size: 12, opacity: 0.1 },
    ],
  },
  mountain: {
    color: '#60A5FA',
    icon: 'trail-sign-outline',
    gradient: ['#1C1940', '#16233A'],
    motif: [
      { icon: 'triangle', top: 55, left: 74, size: 26, opacity: 0.14 },
      { icon: 'triangle-outline', top: 45, left: 88, size: 20, opacity: 0.16, rotate: '4deg' },
      { icon: 'snow-outline', top: 15, left: 84, size: 14, opacity: 0.15 },
      { icon: 'triangle', top: 66, left: 6, size: 18, opacity: 0.1, rotate: '-4deg' },
    ],
  },
  castle: {
    color: '#EF4444',
    icon: 'shield-outline',
    gradient: ['#1C1940', '#341419'],
    motif: [
      { icon: 'shield', top: 10, left: 82, size: 24, opacity: 0.16 },
      { icon: 'flag-outline', top: 46, left: 92, size: 16, opacity: 0.14, rotate: '6deg' },
      { icon: 'shield-outline', top: 74, left: 78, size: 16, opacity: 0.1, rotate: '-10deg' },
    ],
  },
  city: {
    color: '#F4C542',
    icon: 'business-outline',
    gradient: ['#1C1940', '#332A0F'],
    motif: [
      { icon: 'business', top: 58, left: 76, size: 22, opacity: 0.16 },
      { icon: 'business-outline', top: 44, left: 88, size: 28, opacity: 0.14 },
      { icon: 'business', top: 66, left: 92, size: 18, opacity: 0.12 },
      { icon: 'flash-outline', top: 18, left: 82, size: 14, opacity: 0.13 },
    ],
  },
  town: {
    color: '#C084FC',
    icon: 'school-outline',
    gradient: ['#1C1940', '#2B1D40'],
    motif: [
      { icon: 'school', top: 12, left: 80, size: 20, opacity: 0.16 },
      { icon: 'book-outline', top: 46, left: 92, size: 16, opacity: 0.14, rotate: '10deg' },
      { icon: 'school-outline', top: 72, left: 82, size: 16, opacity: 0.1, rotate: '-8deg' },
    ],
  },
  kingdom: {
    color: '#818CF8',
    icon: 'diamond-outline',
    gradient: ['#1C1940', '#1D1F4A'],
    motif: [
      { icon: 'diamond', top: 10, left: 84, size: 20, opacity: 0.18 },
      { icon: 'ribbon-outline', top: 44, left: 92, size: 16, opacity: 0.14, rotate: '-6deg' },
      { icon: 'diamond-outline', top: 72, left: 78, size: 16, opacity: 0.12, rotate: '10deg' },
    ],
  },
  legend: {
    color: '#E9D5FF',
    icon: 'sparkles-outline',
    gradient: ['#262158', '#3D2E5C'],
    motif: [
      { icon: 'sparkles', top: 8, left: 78, size: 18, opacity: 0.3 },
      { icon: 'star', top: 26, left: 92, size: 10, opacity: 0.24 },
      { icon: 'sparkles-outline', top: 50, left: 86, size: 14, opacity: 0.2, rotate: '12deg' },
      { icon: 'moon-outline', top: 70, left: 6, size: 16, opacity: 0.18 },
      { icon: 'star', top: 82, left: 80, size: 8, opacity: 0.22 },
    ],
  },
};

export const LEGEND_STAGE_KEY = 'legend';

export function journeyVisualFor(key: string): JourneyVisual {
  return (
    JOURNEY_VISUALS[key] ?? {
      color: '#9CA3AF',
      icon: 'help-outline',
      gradient: ['#1C1940', '#262158'],
      motif: [],
    }
  );
}
