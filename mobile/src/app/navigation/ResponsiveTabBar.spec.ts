jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
import { navInset, RAIL_WIDTH, SIDEBAR_WIDTH } from './ResponsiveTabBar';

describe('navInset', () => {
  it('keeps bottom tabs on mobile', () => {
    expect(navInset('mobile')).toBe(0);
  });
  it('reserves a rail on tablet and a sidebar on desktop', () => {
    expect(navInset('tablet')).toBe(RAIL_WIDTH);
    expect(navInset('desktop')).toBe(SIDEBAR_WIDTH);
  });
});
