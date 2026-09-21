import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing } from '@/constants/theme';
import { useThemeColors, useThemeStore } from '@/state/themeStore';

const TAB_BAR_CLEARANCE = 72;

/**
 * Global light/dark toggle (Sept 2026 request) — a floating circular
 * button, sun in dark mode ("tap to go light"), moon in light mode ("tap
 * to go dark"), so the icon always shows the mode you're switching TO,
 * not the one you're in. Mounted once in App.tsx, absolutely positioned
 * above the navigator, so it's reachable from every screen without
 * every screen needing to render it.
 *
 * Rendered with the CURRENT theme's colors (not always-dark) so the
 * button itself doesn't look out of place once the app is in light
 * mode — it's the one piece of chrome guaranteed to reflect whichever
 * theme is live, even before every screen has been converted.
 */
export function ThemeToggleButton() {
  const insets = useSafeAreaInsets();
  const mode = useThemeStore((s) => s.mode);
  const toggle = useThemeStore((s) => s.toggle);
  const colors = useThemeColors();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    spin.setValue(0);
    Animated.spring(spin, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 }).start();
  }, [mode, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] });
  const scale = spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.15, 1] });

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      hitSlop={8}
      style={[
        styles.button,
        {
          // Clear the whole bottom tab bar, not just the safe area under
          // it -- the bar's own content is ~49-56pt tall on top of
          // insets.bottom, and the old `insets.bottom + spacing.lg` (24)
          // offset only cleared the safe area, so the button sat back
          // over the bar itself, right on top of the Profile tab.
          bottom: insets.bottom + TAB_BAR_CLEARANCE,
          right: insets.right + spacing.lg,
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.arcaneSoft,
        },
      ]}
    >
      <Animated.View style={{ transform: [{ rotate }, { scale }] }}>
        <Ionicons
          name={mode === 'dark' ? 'sunny' : 'moon'}
          size={22}
          color={mode === 'dark' ? colors.glyph : colors.arcaneSoft}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
});
