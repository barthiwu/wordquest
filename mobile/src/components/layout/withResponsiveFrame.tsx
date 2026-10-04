import type { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import { useThemeColors } from '@/state/themeStore';
import { useBreakpoint } from '@/hooks/useBreakpoint';

const cache = new Map<string, WeakMap<object, ComponentType<any>>>();

/**
 * Wraps a screen so that, on tablet/desktop widths, it
 * sits in a centered column (max-width) on the theme background instead
 * of stretching edge-to-edge. On phones it
 * renders the screen untouched, so the screen's own behaviour, state and
 * navigation props are never affected.
 *
 * Memoized per (component, maxWidth) so it is safe to call inline in a
 * navigator's JSX: the wrapper's identity stays stable across renders
 * (a fresh component type each render would remount the screen).
 */
export function withResponsiveFrame<P extends object>(
  Screen: ComponentType<P>,
  maxWidth = 960,
): ComponentType<P> {
  const key = String(maxWidth);
  let perWidth = cache.get(key);
  if (!perWidth) {
    perWidth = new WeakMap();
    cache.set(key, perWidth);
  }
  const existing = perWidth.get(Screen);
  if (existing) return existing as ComponentType<P>;

  function Framed(props: P) {
    const { isMobile } = useBreakpoint();
    const colors = useThemeColors();
    if (isMobile) return <Screen {...props} />;
    return (
      <View style={[styles.outer, { backgroundColor: colors.background }]}>
        <View style={[styles.inner, { maxWidth }]}>
          <Screen {...props} />
        </View>
      </View>
    );
  }
  Framed.displayName = `Framed(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
  perWidth.set(Screen, Framed);
  return Framed;
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center' },
  inner: { flex: 1, width: '100%' },
});
