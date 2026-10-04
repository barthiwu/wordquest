jest.mock('@/state/themeStore', () => ({ useThemeColors: () => ({ background: '#000' }) }));
import { View } from 'react-native';
import { withResponsiveFrame } from './withResponsiveFrame';

function Dummy() {
  return <View />;
}
function Other() {
  return <View />;
}

describe('withResponsiveFrame', () => {
  it('returns a stable wrapper for the same screen + width (no remounts)', () => {
    expect(withResponsiveFrame(Dummy)).toBe(withResponsiveFrame(Dummy));
    expect(withResponsiveFrame(Dummy, 1280)).toBe(withResponsiveFrame(Dummy, 1280));
  });
  it('keeps wrappers distinct per screen and per width', () => {
    expect(withResponsiveFrame(Dummy)).not.toBe(withResponsiveFrame(Other));
    expect(withResponsiveFrame(Dummy, 960)).not.toBe(withResponsiveFrame(Dummy, 1280));
  });
  it('names the wrapper for debugging', () => {
    expect(withResponsiveFrame(Dummy).displayName).toBe('Framed(Dummy)');
  });
});
