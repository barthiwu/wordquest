import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useBreakpoint, type Breakpoint } from '@/hooks/useBreakpoint';

export const RAIL_WIDTH = 88;
export const SIDEBAR_WIDTH = 248;

const TAB_ICONS: Record<
  string,
  { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Play: { active: 'game-controller', inactive: 'game-controller-outline' },
  Journey: { active: 'map', inactive: 'map-outline' },
  Compete: { active: 'trophy', inactive: 'trophy-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

/** Width the navigator must reserve on the left for the current layout
 * (0 = bottom tabs). Shared by the tab bar and sceneContainerStyle. */
export function navInset(breakpoint: Breakpoint): number {
  if (breakpoint === 'mobile') return 0;
  return breakpoint === 'desktop' ? SIDEBAR_WIDTH : RAIL_WIDTH;
}

/**
 * Adaptive navigation chrome (UI spec §app shell):
 *   mobile   → the stock bottom tab bar
 *   tablet   → compact left rail (icon + label)
 *   desktop  → persistent labelled sidebar
 * Destinations and route keys are identical in every layout.
 */
export function ResponsiveTabBar(props: BottomTabBarProps) {
  const { breakpoint } = useBreakpoint();
  if (breakpoint === 'mobile') return <BottomTabBar {...props} />;
  return <SideNav {...props} expanded={breakpoint === 'desktop'} />;
}

function SideNav({
  state,
  descriptors,
  navigation,
  expanded,
}: BottomTabBarProps & { expanded: boolean }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(colors, expanded, insets.top, insets.bottom),
    [colors, expanded, insets.top, insets.bottom],
  );

  return (
    <View style={styles.nav} accessibilityRole="tablist">
      {expanded && <Text style={styles.brand}>WordQuest</Text>}
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label =
          typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);
        const icon = TAB_ICONS[route.name] ?? TAB_ICONS.Home;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
              styles.item,
              focused && styles.itemActive,
              (hovered || pressed) && !focused && styles.itemHover,
            ]}
          >
            <Ionicons
              name={focused ? icon.active : icon.inactive}
              size={22}
              color={focused ? colors.arcaneSoft : colors.inkMuted}
            />
            <Text
              numberOfLines={1}
              style={[styles.label, focused && styles.labelActive]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors, expanded: boolean, topInset: number, bottomInset: number) {
  return StyleSheet.create({
    nav: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: expanded ? SIDEBAR_WIDTH : RAIL_WIDTH,
      backgroundColor: colors.surface,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      paddingTop: topInset + spacing.lg,
      paddingBottom: bottomInset + spacing.lg,
      paddingHorizontal: expanded ? spacing.md : spacing.sm,
      gap: spacing.xs,
    },
    brand: {
      color: colors.ink,
      fontSize: typography.scale.lg,
      fontWeight: typography.display.weight,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.lg,
    },
    item: {
      minHeight: 48,
      flexDirection: expanded ? 'row' : 'column',
      alignItems: 'center',
      justifyContent: expanded ? 'flex-start' : 'center',
      gap: expanded ? spacing.md : 2,
      paddingHorizontal: expanded ? spacing.md : 0,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    itemActive: { backgroundColor: colors.surfaceRaised },
    itemHover: { backgroundColor: colors.surfaceRaised, opacity: 0.8 },
    label: {
      color: colors.inkMuted,
      fontSize: expanded ? typography.scale.md : 10,
      fontWeight: '600',
    },
    labelActive: { color: colors.ink },
  });
}
