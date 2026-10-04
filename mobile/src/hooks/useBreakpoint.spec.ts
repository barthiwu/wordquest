import { describeBreakpoint, getBreakpoint } from './useBreakpoint';

describe('getBreakpoint', () => {
  it.each([
    [320, 'mobile'],
    [390, 'mobile'],
    [767, 'mobile'],
    [768, 'tablet'],
    [834, 'tablet'],
    [1199, 'tablet'],
    [1200, 'desktop'],
    [1440, 'desktop'],
    [1920, 'desktop'],
  ])('%ipx → %s', (width, expected) => {
    expect(getBreakpoint(width)).toBe(expected);
  });
});

describe('describeBreakpoint', () => {
  it('picks column counts per breakpoint', () => {
    expect(describeBreakpoint(390, 844).columns).toBe(1);
    expect(describeBreakpoint(820, 1180).columns).toBe(2);
    expect(describeBreakpoint(1280, 800).columns).toBe(3);
    expect(describeBreakpoint(1920, 1080).columns).toBe(4);
  });
  it('sets the boolean flags', () => {
    const d = describeBreakpoint(1440, 900);
    expect(d.isDesktop).toBe(true);
    expect(d.isMobile).toBe(false);
  });
});
