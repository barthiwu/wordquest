import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { CONTENT_MAX_WIDTH, useBreakpoint } from '@/hooks/useBreakpoint';
import { spacing } from '@/constants/theme';

interface Props {
  /** Override the max content width (default: spec's ~1280 desktop cap). */
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Centers screen content and caps its width on tablet/desktop so layouts
 * never stretch edge-to-edge on a 1920px window (UI spec: centered
 * max-width ~1280–1440). On mobile it is a transparent pass-through, so
 * wrapping a screen in it never changes the phone layout.
 */
export function ResponsiveContainer({ maxWidth = CONTENT_MAX_WIDTH, style, children }: PropsWithChildren<Props>) {
  const { isMobile, isTablet } = useBreakpoint();
  if (isMobile) return <View style={[styles.fill, style]}>{children}</View>;
  return (
    <View style={styles.outer}>
      <View
        style={[
          styles.inner,
          { maxWidth, paddingHorizontal: isTablet ? spacing.lg : spacing.xl },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  outer: { flex: 1, alignItems: 'center' },
  inner: { flex: 1, width: '100%' },
});
