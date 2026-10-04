import { useWindowDimensions } from 'react-native';

/**
 * Responsive breakpoints from the UI specification:
 *   mobile  320–767   (bottom tabs, single column)
 *   tablet  768–1199  (two-column, compact rail or bottom tabs)
 *   desktop ≥1200     (persistent sidebar, centered max-width, 2–4 columns)
 */
export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export const TABLET_MIN_WIDTH = 768;
export const DESKTOP_MIN_WIDTH = 1200;
/** Content never stretches past this on very wide windows (spec: ~1280–1440). */
export const CONTENT_MAX_WIDTH = 1280;

export function getBreakpoint(width: number): Breakpoint {
  if (width >= DESKTOP_MIN_WIDTH) return 'desktop';
  if (width >= TABLET_MIN_WIDTH) return 'tablet';
  return 'mobile';
}

export interface BreakpointInfo {
  breakpoint: Breakpoint;
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** Suggested column count for card grids at this width. */
  columns: 1 | 2 | 3 | 4;
}

export function describeBreakpoint(width: number, height: number): BreakpointInfo {
  const breakpoint = getBreakpoint(width);
  const columns: BreakpointInfo['columns'] =
    breakpoint === 'mobile' ? 1 : breakpoint === 'tablet' ? 2 : width >= 1600 ? 4 : 3;
  return {
    breakpoint,
    width,
    height,
    isMobile: breakpoint === 'mobile',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
    columns,
  };
}

/** Reactive breakpoint — re-renders on rotation / window resize (unlike a
 * module-level `Dimensions.get('window')`, which is read once). */
export function useBreakpoint(): BreakpointInfo {
  const { width, height } = useWindowDimensions();
  return describeBreakpoint(width, height);
}
