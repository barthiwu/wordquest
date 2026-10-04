import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/state/themeStore';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { GlassCard, IconBadge, Panel, ProtoButton } from './ui/ProtoUI';
import { BackButton } from '@/components/BackButton';

type IconName = keyof typeof Ionicons.glyphMap;

export interface ProtoSettingsRow {
  key: string;
  icon: IconName;
  tint?: string;
  label: string;
  hint?: string;
  value?: string;
  accessibilityLabel?: string;
  onPress?: () => void;
  toggle?: { value: boolean; onChange: (on: boolean) => void };
}

export interface ProtoSettingsGroup {
  key: string;
  title: string;
  rows: ProtoSettingsRow[];
}

export interface ProtoSettingsViewProps {
  title: string;
  profile: { name: string; username?: string | null; avatarUrl?: string | null; label: string; onPress: () => void };
  groups: ProtoSettingsGroup[];
  logout: { label: string; busy: boolean; onPress: () => void };
  onBack: () => void;
}

/**
 * Prototype "New look" Settings hub: identity card, grouped icon rows, and
 * a sign-out button. The host screen supplies the groups so both looks stay
 * in lock-step as settings are added.
 */
export function ProtoSettingsView({ title, profile, groups, logout, onBack }: ProtoSettingsViewProps) {
  const colors = useThemeColors();
  const { isMobile } = useBreakpoint();
  const wide = !isMobile;
  const initial = profile.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={[styles.scroll, wide && styles.scrollWide]} showsVerticalScrollIndicator={false}>
      <BackButton onPress={onBack} />
      <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>

      <Pressable onPress={profile.onPress} accessibilityRole="button" accessibilityLabel={profile.label}>
        <GlassCard style={styles.profile}>
          <View style={[styles.avatar, { borderColor: colors.arcane, backgroundColor: colors.surface }]}>
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '900' }}>{initial}</Text>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '900' }} numberOfLines={1}>{profile.name}</Text>
            {profile.username ? <Text style={{ color: colors.arcaneSoft, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>@{profile.username}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
        </GlassCard>
      </Pressable>

      {groups.map((g) => (
        <View key={g.key} style={{ gap: 8 }}>
          <Text style={[styles.groupTitle, { color: colors.inkMuted }]}>{g.title}</Text>
          <Panel style={styles.group}>
            {g.rows.map((r, i) => {
              const content = (
                <>
                  <IconBadge name={r.icon} color={r.tint ?? colors.arcane} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '800' }}>{r.label}</Text>
                    {r.hint ? <Text style={{ color: colors.inkMuted, fontSize: 12 }}>{r.hint}</Text> : null}
                  </View>
                  {r.toggle ? (
                    <Switch
                      value={r.toggle.value}
                      onValueChange={r.toggle.onChange}
                      trackColor={{ false: colors.border, true: colors.arcane }}
                      thumbColor={colors.ink}
                      accessibilityLabel={r.accessibilityLabel ?? r.label}
                    />
                  ) : (
                    <>
                      {r.value ? <Text style={{ color: colors.inkMuted, fontSize: 13 }}>{r.value}</Text> : null}
                      {r.onPress ? <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} /> : null}
                    </>
                  )}
                </>
              );
              const border = i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : null;
              return r.toggle || !r.onPress ? (
                <View key={r.key} style={[styles.row, border]}>{content}</View>
              ) : (
                <Pressable key={r.key} onPress={r.onPress} accessibilityRole="button" accessibilityLabel={r.accessibilityLabel ?? r.label} style={[styles.row, border]}>
                  {content}
                </Pressable>
              );
            })}
          </Panel>
        </View>
      ))}

      {logout.busy ? (
        <ActivityIndicator color={colors.arcaneSoft} style={{ marginTop: 8 }} />
      ) : (
        <ProtoButton variant="danger" icon="log-out-outline" label={logout.label} onPress={logout.onPress} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingTop: 20, gap: 14, paddingBottom: 40 },
  scrollWide: { maxWidth: 720, width: '100%', alignSelf: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '900' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 50, height: 50, borderRadius: 25 },
  groupTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', paddingHorizontal: 4 },
  group: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
});
