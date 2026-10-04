jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
import { navInset, RAIL_WIDTH, SIDEBAR_WIDTH } from './ResponsiveTabBar';

describe('navInset', () => {
  it('reserves nothing for the classic UI at any width', () => {
    expect(navInset(false, 'mobile')).toBe(0);
    expect(navInset(false, 'tablet')).toBe(0);
    expect(navInset(false, 'desktop')).toBe(0);
  });
  it('keeps bottom tabs on mobile in the new look', () => {
    expect(navInset(true, 'mobile')).toBe(0);
  });
  it('reserves a rail on tablet and a sidebar on desktop', () => {
    expect(navInset(true, 'tablet')).toBe(RAIL_WIDTH);
    expect(navInset(true, 'desktop')).toBe(SIDEBAR_WIDTH);
  });
});
