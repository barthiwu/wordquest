import { useCallback, useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { listQuests, type QuestCatalogEntry } from '@/services/quests';
import { useAuthStore } from '@/state/authStore';
import { formatLocalClock, timeOfDayPeriod } from '@/utils/timeOfDay';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '@/app/navigation/MainTabNavigator';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Quest'>,
  NativeStackScreenProps<RootStackParamList>
>;

/**
 * The Quest tab. Each quest unlocks at a player-local hour and, once
 * unlocked, never re-locks — missing Morning Quest doesn't cost you
 * anything, it's just still sitting there at Noon, in the Evening, or
 * tomorrow. Lock state here is a convenience label computed from the
 * device clock; the server enforces the real gate independently when
 * the player actually taps Start (never trust the client to have
 * decided correctly). DailyQuest itself is pushed on the root stack, so
 * the tab bar disappears during actual play.
 */
export function QuestScreen({ navigation }: Props) {
  const { t } = useTranslation('quests');
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [quests, setQuests] = useState<QuestCatalogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    listQuests(accessToken)
      .then(setQuests)
      .catch(() => setError(t('loadError')));
  }, [accessToken, t]);

  useFocusEffect(load);

  // The player's actual local clock, not a value frozen at mount --
  // "Your local time should not be approximated, it should be exact
  // like the actual time" (it used to show only getHours(), always
  // reading e.g. "18:00" regardless of the real minute). Ticks every
  // 15s, which is plenty for a clock label and for the quest-unlock
  // hour boundary below to flip on its own while this screen is open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(interval);
  }, []);
  const localHour = now.getHours();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('title')}</Text>

      {!quests && !error && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.arcaneSoft} />
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {quests && quests.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('emptyState')}</Text>
        </View>
      )}

      {quests?.map((quest) => {
        const locked = quest.windowStartHour !== null && localHour < quest.windowStartHour;
        const unlockTime = `${String(quest.windowStartHour).padStart(2, '0')}:00`;
        return (
          <View key={quest.key} style={[styles.card, locked && styles.cardLocked]}>
            <Text style={styles.cardTitle}>{quest.title}</Text>
            <Text style={styles.cardBody}>{quest.description}</Text>
            {quest.windowStartHour !== null && (
              <Text style={styles.window}>
                {String(quest.windowStartHour).padStart(2, '0')}:00
                {quest.windowEndHour !== null
                  ? `-${String(quest.windowEndHour).padStart(2, '0')}:59`
                  : ''}
              </Text>
            )}
            <Pressable
              style={[styles.button, locked && styles.buttonLocked]}
              onPress={() => navigation.navigate('DailyQuest', { questKey: quest.key })}
              disabled={locked}
              accessibilityRole="button"
              accessibilityLabel={
                locked
                  ? t('unlocksAtAccessibilityLabel', { title: quest.title, time: unlockTime })
                  : t('startAccessibilityLabel', { title: quest.title })
              }
            >
              <Text style={styles.buttonText}>
                {locked ? t('unlocksAt', { time: unlockTime }) : t('start')}
              </Text>
            </Pressable>
          </View>
        );
      })}

      <Text style={styles.deviceTime}>
        {t('localTime', { period: timeOfDayPeriod(now), clock: formatLocalClock(now) })}
      </Text>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      paddingTop: topInset + spacing.xl,
      gap: spacing.md,
    },
    centered: { alignItems: 'center', paddingVertical: spacing.xl },
    empty: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    emptyText: { color: colors.inkMuted, fontSize: typography.scale.sm },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    error: { color: colors.danger, fontSize: typography.scale.md },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    cardLocked: { opacity: 0.6 },
    cardTitle: { color: colors.arcaneSoft, fontSize: typography.scale.lg, fontWeight: '700' },
    cardBody: { color: colors.inkMuted, fontSize: typography.scale.sm },
    window: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    button: {
      marginTop: spacing.xs,
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    buttonLocked: { backgroundColor: colors.surfaceRaised },
    buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    deviceTime: { color: colors.inkMuted, fontSize: typography.scale.xs, textAlign: 'center' },
  });
}
