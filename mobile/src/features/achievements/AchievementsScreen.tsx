import { useCallback, useState, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import {
  getAchievementCatalog,
  getMyAchievements,
  type AchievementCatalogEntry,
  type AchievementUnlock,
} from '@/services/achievements';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Achievements'>;

const CATEGORY_LABELS: Record<string, string> = {
  DISCOVERY: 'Discovery',
  MASTERY: 'Mastery',
  CONSISTENCY: 'Consistency',
  INDEPENDENT_LEARNING: 'Independent Learning',
  COMPETITION: 'Competition',
};

/**
 * Screen 32 of the UI/UX Screen Bible. Each catalog entry is permanent
 * and public (spec §6.1); unlock state comes from the player's own
 * unlocks list. A "checkable: false" entry still displays — it just
 * can't be earned yet, same honesty PassportScreen already applies to
 * modules that don't exist.
 */
export function AchievementsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [catalog, setCatalog] = useState<AchievementCatalogEntry[] | null>(null);
  const [unlocks, setUnlocks] = useState<AchievementUnlock[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    Promise.all([getAchievementCatalog(accessToken), getMyAchievements(accessToken)])
      .then(([c, u]) => {
        setCatalog(c);
        setUnlocks(u);
      })
      .catch(() => setError('Could not load your achievements.'));
  }, [accessToken]);

  useFocusEffect(load);

  if (error) {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!catalog || !unlocks) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  const unlockedIds = new Set(unlocks.map((u) => u.achievementId));
  const byCategory = catalog.reduce<Record<string, AchievementCatalogEntry[]>>((acc, entry) => {
    (acc[entry.category] ??= []).push(entry);
    return acc;
  }, {});

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Achievements</Text>
      <Text style={styles.subtitle}>
        {unlockedIds.size} of {catalog.length} unlocked
      </Text>

      {Object.entries(byCategory).map(([category, entries]) => (
        <View key={category} style={styles.section}>
          <Text style={styles.sectionTitle}>{CATEGORY_LABELS[category] ?? category}</Text>
          {entries.map((entry) => {
            const unlocked = unlockedIds.has(entry.id);
            return (
              <View key={entry.id} style={[styles.card, !unlocked && styles.cardLocked]}>
                <Text style={[styles.cardTitle, unlocked && styles.cardTitleUnlocked]}>
                  {entry.name}
                </Text>
                <Text style={styles.cardBody}>{entry.description}</Text>
                {!entry.checkable && <Text style={styles.comingSoon}>Coming soon</Text>}
              </View>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: topInset + spacing.xxl, gap: spacing.lg },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.danger, fontSize: typography.scale.md },
  title: {
    color: colors.ink,
    fontSize: typography.scale.xl,
    fontWeight: typography.display.weight,
  },
  subtitle: { color: colors.inkMuted, fontSize: typography.scale.sm },
  section: { gap: spacing.sm },
  sectionTitle: {
    color: colors.arcaneSoft,
    fontSize: typography.scale.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  cardLocked: { opacity: 0.5 },
  cardTitle: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
  cardTitleUnlocked: { color: colors.glyph },
  cardBody: { color: colors.inkMuted, fontSize: typography.scale.sm },
  comingSoon: {
    color: colors.inkMuted,
    fontSize: typography.scale.xs,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
}
