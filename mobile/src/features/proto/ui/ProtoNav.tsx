import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { useBreakpoint, type Breakpoint } from '@/hooks/useBreakpoint';
import { AvatarBubble } from '@/components/AvatarBubble';
import { Wordmark } from './ProtoUI';
import { useProtoExtras } from './useProtoExtras';

export const PROTO_SIDEBAR_WIDTH = 224;
export const PROTO_TOPBAR_HEIGHT = 64;

const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Play: { active: 'game-controller', inactive: 'game-controller-outline' },
  Journey: { active: 'map', inactive: 'map-outline' },
  Compete: { active: 'trophy', inactive: 'trophy-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

/** Space the prototype nav reserves around the scene (bottom tabs reserve none). */
export function protoInset(breakpoint: Breakpoint): { left: number; top: number } {
  if (breakpoint === 'desktop') return { left: PROTO_SIDEBAR_WIDTH, top: PROTO_TOPBAR_HEIGHT };
  if (breakpoint === 'tablet') return { left: 0, top: PROTO_TOPBAR_HEIGHT };
  return { left: 0, top: 0 };
}

function useTabItems({ state, descriptors, navigation }: BottomTabBarProps) {
  return state.routes.map((route, index) => {
    const focused = state.index === index;
    const { options } = descriptors[route.key];
    const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);
    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };
    return { key: route.key, name: route.name, label, focused, onPress, icon: TAB_ICONS[route.name] ?? TAB_ICONS.Home };
  });
}

function TopActions({ navigation }: { navigation: { navigate: (...a: any[]) => void } }) {
  const colors = useThemeColors();
  const user = useAuthStore((s) => s.user);
  return (
    <View style={styles.actions}>
      <Pressable
        onPress={() => navigation.navigate('Notifications')}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        hitSlop={8}
        style={styles.iconBtn}
      >
        <Ionicons name="notifications-outline" size={22} color={colors.ink} />
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate('Main', { screen: 'Profile' })}
        accessibilityRole="button"
        accessibilityLabel="Profile"
        hitSlop={8}
        style={[styles.avatarRing, { borderColor: colors.arcane }]}
      >
        <AvatarBubble colors={colors} avatarUrl={user?.avatarUrl} username={user?.displayName ?? '?'} size={34} />
      </Pressable>
    </View>
  );
}

/** Mobile top row (wordmark · bell · avatar). Returns nothing on wider
 * layouts, where the nav chrome carries these. */
export function ProtoMobileHeader() {
  const { isMobile } = useBreakpoint();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  if (!isMobile) return null;
  return (
    <View style={[styles.mobileHeader, { paddingTop: insets.top + 8 }]}>
      <Wordmark size={17} />
      <TopActions navigation={navigation} />
    </View>
  );
}

export function ProtoNav(props: BottomTabBarProps) {
  const { breakpoint } = useBreakpoint();
  if (breakpoint === 'desktop') return <Sidebar {...props} />;
  if (breakpoint === 'tablet') return <TopBar {...props} />;
  return <BottomBar {...props} />;
}

function BottomBar(props: BottomTabBarProps) {
  const colors = useThemeColors();
  const x = useProtoExtras();
  const insets = useSafeAreaInsets();
  const items = useTabItems(props);
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bottom, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}
    >
      {items.map((it) => (
        <Pressable
          key={it.key}
          onPress={it.onPress}
          accessibilityRole="tab"
          accessibilityState={{ selected: it.focused }}
          accessibilityLabel={it.label}
          style={styles.bottomItem}
        >
          {it.focused && <View style={[styles.bottomGlow, { backgroundColor: x.cta[0] }]} />}
          <Ionicons name={it.focused ? it.icon.active : it.icon.inactive} size={24} color={it.focused ? colors.arcane : colors.inkMuted} />
          <Text numberOfLines={1} style={[styles.bottomLabel, { color: it.focused ? colors.arcane : colors.inkMuted }]}>
            {it.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function TopBar(props: BottomTabBarProps) {
  const colors = useThemeColors();
  const x = useProtoExtras();
  const insets = useSafeAreaInsets();
  const items = useTabItems(props);
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.topBar, { backgroundColor: x.glass, borderBottomColor: x.glassBorder, height: PROTO_TOPBAR_HEIGHT + insets.top, paddingTop: insets.top }]}
    >
      <Wordmark size={20} />
      <View style={styles.topLinks}>
        {items.map((it) => (
          <Pressable
            key={it.key}
            onPress={it.onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: it.focused }}
            accessibilityLabel={it.label}
            style={[styles.topLink, it.focused && { backgroundColor: `${colors.arcane}22` }]}
          >
            <Text style={{ color: it.focused ? colors.arcane : colors.inkMuted, fontWeight: it.focused ? '800' : '600', fontSize: 14 }}>{it.label}</Text>
          </Pressable>
        ))}
      </View>
      <TopActions navigation={props.navigation.getParent() ?? props.navigation} />
    </View>
  );
}

function Sidebar(props: BottomTabBarProps) {
  const colors = useThemeColors();
  const x = useProtoExtras();
  const insets = useSafeAreaInsets();
  const items = useTabItems(props);
  return (
    <>
      <View
        accessibilityRole="tablist"
        style={[styles.sidebar, { backgroundColor: colors.surface, borderRightColor: colors.border, paddingTop: insets.top + 18 }]}
      >
        <View style={styles.sideBrand}>
          <Wordmark size={21} />
        </View>
        {items.map((it) => (
          <Pressable
            key={it.key}
            onPress={it.onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: it.focused }}
            accessibilityLabel={it.label}
            style={(state) => [
              styles.sideItem,
              it.focused && { backgroundColor: `${colors.arcane}2B` },
              (state as { hovered?: boolean }).hovered && !it.focused && { backgroundColor: colors.surfaceRaised },
            ]}
          >
            {it.focused && <View style={[styles.sideBar, { backgroundColor: x.cta[0] }]} />}
            <Ionicons name={it.focused ? it.icon.active : it.icon.inactive} size={22} color={it.focused ? colors.arcane : colors.inkMuted} />
            <Text style={{ color: it.focused ? colors.ink : colors.inkMuted, fontWeight: it.focused ? '800' : '600', fontSize: 15 }}>{it.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.sideHeader, { left: PROTO_SIDEBAR_WIDTH, height: PROTO_TOPBAR_HEIGHT + insets.top, paddingTop: insets.top }]}>
        <TopActions navigation={props.navigation.getParent() ?? props.navigation} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { borderWidth: 2, borderRadius: 20, padding: 1 },
  mobileHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  bottom: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 6 },
  bottomItem: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4, minHeight: 48 },
  bottomGlow: { position: 'absolute', top: -7, width: 28, height: 3, borderRadius: 2 },
  bottomLabel: { fontSize: 11, fontWeight: '700' },
  topBar: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, borderBottomWidth: 1, zIndex: 20 },
  topLinks: { flexDirection: 'row', gap: 6 },
  topLink: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  sidebar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: PROTO_SIDEBAR_WIDTH, borderRightWidth: 1, paddingHorizontal: 12, gap: 4, zIndex: 20 },
  sideBrand: { paddingHorizontal: 10, paddingBottom: 22 },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, minHeight: 48, borderRadius: 14 },
  sideBar: { position: 'absolute', left: -12, top: 10, bottom: 10, width: 4, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  sideHeader: { position: 'absolute', right: 0, top: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 28, zIndex: 20 },
});
