jest.mock('@/state/themeStore', () => ({ useThemeColors: () => ({}) }));
import { questPeriod } from './ProtoHomeScreen';

describe('questPeriod', () => {
  it('labels the three seeded windows Morning, Afternoon, Evening', () => {
    expect(questPeriod({ windowStartHour: 0 })).toBe('morning');
    expect(questPeriod({ windowStartHour: 12 })).toBe('afternoon');
    expect(questPeriod({ windowStartHour: 16 })).toBe('evening');
  });

  it('treats a missing start hour as morning and the 11:59 / 15:59 edges consistently', () => {
    expect(questPeriod({ windowStartHour: null })).toBe('morning');
    expect(questPeriod({ windowStartHour: 11 })).toBe('morning');
    expect(questPeriod({ windowStartHour: 15 })).toBe('afternoon');
    expect(questPeriod({ windowStartHour: 23 })).toBe('evening');
  });
});
