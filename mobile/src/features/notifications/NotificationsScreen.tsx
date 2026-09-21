import { useCallback, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  type AppNotification,
  type NotificationPreferences,
} from '@/services/notifications';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const PREFERENCE_TOGGLES: { key: keyof NotificationPreferences; label: string }[] = [
  { key: 'dailyQuestsEnabled', label: 'Daily Quest reminders' },
  { key: 'learningRemindersEnabled', label: 'Review & practice reminders' },
  { key: 'progressEnabled', label: 'Level, Journey & Achievement updates' },
  { key: 'competitionEnabled', label: 'Boss Battle & leaderboard updates' },
];

/**
 * The Notification Engine's inbox + preferences (spec §15/§19), combined
 * into one screen rather than two routes — both are short enough that a
 * separate preferences screen would just be an extra tap for no benefit.
 */
export function NotificationsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    Promise.all([getMyNotifications(accessToken), getNotificationPreferences(accessToken)])
      .then(([n, p]) => {
        setNotifications(n);
        setPreferences(p);
      })
      .catch(() => setError('Could not load your notifications.'));
  }, [accessToken]);

  useFocusEffect(load);

  const onMarkRead = async (id: string) => {
    if (!accessToken) return;
    setNotifications((prev) =>
      prev ? prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)) : prev,
    );
    try {
      await markNotificationRead(accessToken, id);
    } catch {
      // Best-effort local update; a stale read state here is low-stakes and self-corrects on next load.
    }
  };

  const onMarkAllRead = async () => {
    if (!accessToken) return;
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev ? prev.map((n) => ({ ...n, readAt: n.readAt ?? now })) : prev,
    );
    try {
      await markAllNotificationsRead(accessToken);
    } catch {
      // Same best-effort posture as onMarkRead.
    }
  };

  const onTogglePreference = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!accessToken || !preferences) return;
    const previous = preferences;
    setPreferences({ ...preferences, [key]: value });
    try {
      await updateNotificationPreferences(accessToken, { [key]: value });
    } catch {
      setPreferences(previous);
    }
  };

  // V22 §12 finding: quiet hours were fully enforced server-side but had
  // no UI to set them — quietHoursStartHour/EndHour stayed null (i.e.
  // disabled) for every real user. Toggling on picks a sensible default
  // window; the hour steppers below only render while enabled.
  const quietHoursEnabled =
    !!preferences &&
    preferences.quietHoursStartHour != null &&
    preferences.quietHoursEndHour != null;

  const onToggleQuietHours = async (enabled: boolean) => {
    if (!accessToken || !preferences) return;
    const previous = preferences;
    const next = enabled
      ? { quietHoursStartHour: 22, quietHoursEndHour: 7 }
      : { quietHoursStartHour: null, quietHoursEndHour: null };
    setPreferences({ ...preferences, ...next });
    try {
      await updateNotificationPreferences(accessToken, next);
    } catch {
      setPreferences(previous);
    }
  };

  const onAdjustQuietHour = async (
    key: 'quietHoursStartHour' | 'quietHoursEndHour',
    delta: number,
  ) => {
    if (!accessToken || !preferences) return;
    const current = preferences[key] ?? 0;
    const next = (current + delta + 24) % 24;
    const previous = preferences;
    setPreferences({ ...preferences, [key]: next });
    try {
      await updateNotificationPreferences(accessToken, { [key]: next });
    } catch {
      setPreferences(previous);
    }
  };

  const formatHour = (hour: number) => {
    const period = hour < 12 ? 'AM' : 'PM';
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}:00 ${period}`;
  };

  if (error) {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!notifications || !preferences) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <View style={styles.headerRow}>
        <Text style={styles.title}>Notifications</Text>
        {unreadCount > 0 && (
          <Pressable
            onPress={onMarkAllRead}
            accessibilityRole="button"
            accessibilityLabel="Mark all read"
          >
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {notifications.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Nothing here yet — you’ll see quest reminders and progress updates as they happen.
          </Text>
        </View>
      )}

      {notifications.map((n) => (
        <Pressable
          key={n.id}
          style={[styles.card, !n.readAt && styles.cardUnread]}
          onPress={() => onMarkRead(n.id)}
          accessibilityRole="button"
          accessibilityLabel={n.title}
          accessibilityHint={n.readAt ? undefined : 'marks as read'}
        >
          <Text style={styles.cardTitle}>{n.title}</Text>
          <Text style={styles.cardBody}>{n.body}</Text>
        </Pressable>
      ))}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        {PREFERENCE_TOGGLES.map(({ key, label }) => (
          <View key={key} style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{label}</Text>
            <Switch
              value={preferences[key] as boolean}
              onValueChange={(value) => onTogglePreference(key, value)}
              trackColor={{ false: colors.border, true: colors.arcaneSoft }}
              thumbColor={colors.ink}
              accessibilityLabel={label}
            />
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Quiet hours</Text>
          <Switch
            value={quietHoursEnabled}
            onValueChange={onToggleQuietHours}
            trackColor={{ false: colors.border, true: colors.arcaneSoft }}
            thumbColor={colors.ink}
            accessibilityLabel="Quiet hours"
          />
        </View>
        {quietHoursEnabled &&
          preferences.quietHoursStartHour != null &&
          preferences.quietHoursEndHour != null && (
            <>
              <Text style={styles.quietHoursHint}>
                No push notifications between these hours, in your own timezone.
              </Text>
              <View style={styles.hourStepperRow}>
                <HourStepper
                  label="From"
                  hour={preferences.quietHoursStartHour}
                  onChange={(delta) => onAdjustQuietHour('quietHoursStartHour', delta)}
                  formatHour={formatHour}
                  styles={styles}
                />
                <HourStepper
                  label="Until"
                  hour={preferences.quietHoursEndHour}
                  onChange={(delta) => onAdjustQuietHour('quietHoursEndHour', delta)}
                  formatHour={formatHour}
                  styles={styles}
                />
              </View>
            </>
          )}
      </View>
    </ScrollView>
  );
}

function HourStepper({
  label,
  hour,
  onChange,
  formatHour,
  styles,
}: {
  label: string;
  hour: number;
  onChange: (delta: number) => void;
  formatHour: (hour: number) => string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.hourStepper}>
      <Text style={styles.hourStepperLabel}>{label}</Text>
      <View style={styles.hourStepperControls}>
        <Pressable
          style={styles.hourStepperButton}
          onPress={() => onChange(-1)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: earlier`}
        >
          <Text style={styles.hourStepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.hourStepperValue}>{formatHour(hour)}</Text>
        <Pressable
          style={styles.hourStepperButton}
          onPress={() => onChange(1)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: later`}
        >
          <Text style={styles.hourStepperButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: topInset + spacing.xxl, gap: spacing.md },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.danger, fontSize: typography.scale.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: {
    color: colors.ink,
    fontSize: typography.scale.xl,
    fontWeight: typography.display.weight,
  },
  markAllText: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '700' },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  emptyText: { color: colors.inkMuted, fontSize: typography.scale.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  cardUnread: { borderColor: colors.arcaneSoft },
  cardTitle: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
  cardBody: { color: colors.inkMuted, fontSize: typography.scale.sm },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.scale.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: {
    color: colors.inkMuted,
    fontSize: typography.scale.sm,
    flex: 1,
    marginRight: spacing.sm,
  },
  quietHoursHint: { color: colors.inkMuted, fontSize: typography.scale.xs },
  hourStepperRow: { flexDirection: 'row', gap: spacing.md },
  hourStepper: { flex: 1, gap: 4, alignItems: 'center' },
  hourStepperLabel: {
    color: colors.inkMuted,
    fontSize: typography.scale.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  hourStepperControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  hourStepperButton: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourStepperButtonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
  hourStepperValue: {
    color: colors.ink,
    fontSize: typography.scale.sm,
    fontWeight: '700',
    minWidth: 72,
    textAlign: 'center',
  },
});
}
