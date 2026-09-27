import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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

type DayStatus = 'played' | 'missed' | 'today' | 'future';

interface CalendarDay {
  day: number;
  localDate: string;
  status: DayStatus;
}

/** Locale-correct Sun..Sat header, derived from Intl rather than a
 * hardcoded English list -- Jan 1, 2023 was a Sunday, used purely as a
 * fixed, DST-safe anchor date to read each weekday's short name off. */
const WEEKDAY_LABELS = Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat(undefined, { weekday: 'short' })
    .format(new Date(2023, 0, i + 1))
    .slice(0, 2),
);

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Full month-grid Catch-Up Calendar (Barth, Sept 2026 redesign — replaces
 * the old flat list of playable days). Always shows the PLAYER'S CURRENT
 * LOCAL MONTH, in full, and nothing else — there is deliberately no way
 * to page to a previous or future month: "The calendar cannot go beyond
 * the current month of the player's local phone detail... It also can't
 * show October yet as we've not gotten there." Once the phone rolls into
 * the next month, this whole month's grid becomes unreachable — the one
 * warning is MONTH_END_CATCH_UP, which fires the day before that happens
 * (see backend notification-scheduler.service.ts).
 *
 * Four visual states, three of which map directly to what the backend
 * can and can't offer for a given day (GET /quests/history/dates — every
 * past local date with at least one QuestAttempt):
 *  - "played" (green) — has activity; tapping opens CatchUpReplayScreen
 *    for a no-XP review of that day's words, same as the old list screen.
 *  - "missed" (red) — already ended, zero activity. NOT tappable: the
 *    backend has no words to show for a day nothing was ever exposed on
 *    (QuestsService.getHistoryForDate 404s: "No Quest activity found"),
 *    so this is a visual marker, never a broken link.
 *  - "future"/unavailable (faded) — today hasn't reached this day yet,
 *    so there's nothing to mark either way. Not tappable.
 *  - "today" — highlighted rather than played/missed-colored, since the
 *    day isn't over and the backend explicitly rejects a catch-up replay
 *    for a day that hasn't ended yet, whether or not it's been played.
 *
 * Built off the DEVICE's local Date, not a server-fetched player-local
 * date — this is a read-only presentation screen, and Barth's own spec
 * frames the whole feature in exactly those terms ("the player's local
 * phone detail"). Same departure Home's dateBadge already takes,
 * documented there.
 */
export function CatchUpCalendarScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('catchUp');
  const accessToken = useAuthStore((s) => s.accessToken);

  const [playedDates, setPlayedDates] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    setError(null);
    getHistoryDates(accessToken)
      .then((dates) => setPlayedDates(new Set(dates)))
      .catch(() => setError(t('calendarLoadError')));
  }, [accessToken, t]);

  useFocusEffect(load);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const todayNum = now.getDate();
  const monthLabel = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday

  const days: CalendarDay[] = useMemo(() => {
    const result: CalendarDay[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const localDate = `${year}-${pad(month + 1)}-${pad(d)}`;
      let status: DayStatus;
      if (d === todayNum) {
        status = 'today';
      } else if (d > todayNum) {
        status = 'future';
      } else {
        status = playedDates?.has(localDate) ? 'played' : 'missed';
      }
      result.push({ day: d, localDate, status });
    }
    return result;
  }, [playedDates, year, month, todayNum, daysInMonth]);

  const missedCount = days.filter((d) => d.status === 'missed').length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>{t('calendarTitle')}</Text>
        <Text style={styles.subtitle}>{monthLabel}</Text>
      </View>

      {error && (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
        </View>
      )}

      {!error && playedDates === null && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.arcaneSoft} />
        </View>
      )}

      {!error && playedDates !== null && (
        <View style={styles.body}>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, i) => (
              <Text key={i} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <View key={`pad-${i}`} style={styles.cell} />
            ))}
            {days.map((d) => {
              const interactive = d.status === 'played';
              return (
                <Pressable
                  key={d.localDate}
                  style={styles.cell}
                  disabled={!interactive}
                  onPress={() => navigation.navigate('CatchUpReplay', { localDate: d.localDate })}
                  accessibilityRole={interactive ? 'button' : undefined}
                  accessibilityLabel={t('calendarDayLabel', {
                    date: new Date(year, month, d.day).toLocaleDateString(),
                  })}
                >
                  <View
                    style={[
                      styles.dayCell,
                      d.status === 'played' && styles.dayPlayed,
                      d.status === 'missed' && styles.dayMissed,
                      d.status === 'future' && styles.dayFuture,
                      d.status === 'today' && styles.dayToday,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        d.status === 'played' && styles.dayNumberPlayed,
                        d.status === 'missed' && styles.dayNumberMissed,
                        d.status === 'future' && styles.dayNumberFuture,
                        d.status === 'today' && styles.dayNumberToday,
                      ]}
                    >
                      {d.day}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: colors.success }]} />
              <Text style={styles.legendText}>{t('calendarLegendPlayed')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: colors.danger }]} />
              <Text style={styles.legendText}>{t('calendarLegendMissed')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, styles.legendSwatchFaded]} />
              <Text style={styles.legendText}>{t('calendarLegendUnavailable')}</Text>
            </View>
          </View>

          {missedCount > 0 ? (
            <Text style={styles.missedSummary}>
              {t('calendarMissedSummary', { count: missedCount })}
            </Text>
          ) : (
            <View style={styles.emptyMissed}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.missedSummary}>{t('calendarNoneMissed')}</Text>
            </View>
          )}
        </View>
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
    body: { padding: spacing.xl, gap: spacing.md },
    weekdayRow: { flexDirection: 'row' },
    weekdayLabel: {
      flex: 1,
      textAlign: 'center',
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: '14.2857%', aspectRatio: 1, padding: 2 },
    dayCell: {
      flex: 1,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    dayPlayed: { backgroundColor: colors.success },
    dayMissed: { backgroundColor: colors.danger },
    dayFuture: { backgroundColor: colors.surfaceRaised, opacity: 0.4 },
    dayToday: { backgroundColor: colors.surface, borderColor: colors.arcaneSoft },
    dayNumber: { fontSize: typography.scale.sm, fontWeight: '700', color: colors.ink },
    dayNumberPlayed: { color: '#0B2914' },
    dayNumberMissed: { color: '#FFFFFF' },
    dayNumberFuture: { color: colors.inkMuted },
    dayNumberToday: { color: colors.arcaneSoft },
    legend: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md, flexWrap: 'wrap' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendSwatch: { width: 12, height: 12, borderRadius: radius.sm },
    legendSwatchFaded: { backgroundColor: colors.surfaceRaised, opacity: 0.4 },
    legendText: { color: colors.inkMuted, fontSize: typography.scale.xs },
    missedSummary: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
    emptyMissed: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
    },
  });
}
