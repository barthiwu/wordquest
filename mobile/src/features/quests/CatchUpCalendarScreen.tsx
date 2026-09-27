import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { getHistoryDates } from '@/services/quests';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'CatchUpCalendar'>;

/**
 * Catch-up calendar (product request, Sept 2026): lists every past
 * local date the player has real Quest activity on (GET
 * /quests/history/dates, most-recent first), so a missed day is never
 * just gone -- tapping one opens CatchUpReplayScreen for a no-XP review
 * of that day's words.
 *
 * localDate strings are "YYYY-MM-DD" in the PLAYER'S OWN local calendar
 * (see backend PlayerClockService) -- parsed via parseLocalDate below
 * rather than `new Date(localDate)` directly, which V8 treats as UTC
 * midnight and can display one day off in negative-UTC-offset
 * timezones once .toLocaleDateString() renders it back in the device's
 * own zone.
 */
function parseLocalDate(localDate: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function CatchUpCalendarScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('catchUp');
  const accessToken = useAuthStore((s) => s.accessToken);

  const [dates, setDates] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    setError(null);
    getHistoryDates(accessToken)
      .then(setDates)
      .catch(() => setError(t('calendarLoadError')));
  }, [accessToken, t]);

  useFocusEffect(load);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>{t('calendarTitle')}</Text>
        <Text style={styles.subtitle}>{t('calendarSubtitle')}</Text>
      </View>

      {error && (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
        </View>
      )}

      {!error && dates === null && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.arcaneSoft} />
        </View>
      )}

      {!error && dates !== null && dates.length === 0 && (
        <View style={styles.centered}>
          <Ionicons name="calendar-outline" size={40} color={colors.inkMuted} />
          <Text style={styles.emptyTitle}>{t('calendarEmptyTitle')}</Text>
          <Text style={styles.emptyBody}>{t('calendarEmptyBody')}</Text>
        </View>
      )}

      {!error && dates !== null && dates.length > 0 && (
        <FlatList
          data={dates}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate('CatchUpReplay', { localDate: item })}
              accessibilityRole="button"
              accessibilityLabel={t('calendarDayLabel', {
                date: parseLocalDate(item).toLocaleDateString(),
              })}
            >
              <Ionicons name="calendar" size={18} color={colors.arcaneSoft} />
              <Text style={styles.rowText}>
                {t('calendarDayLabel', { date: parseLocalDate(item).toLocaleDateString() })}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: spacing.xl,
      paddingTop: topInset + spacing.md,
      gap: spacing.xs,
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
      marginTop: spacing.sm,
    },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.sm },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.sm,
    },
    error: { color: colors.danger, fontSize: typography.scale.md, textAlign: 'center' },
    emptyTitle: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    emptyBody: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
    list: { padding: spacing.xl, gap: spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    rowText: { flex: 1, color: colors.ink, fontSize: typography.scale.md, fontWeight: '600' },
  });
}
