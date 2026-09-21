import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { getMyProgression, type Progression } from '@/services/progression';
import { useAuthStore } from '@/state/authStore';
import { timeOfDayGreeting } from '@/utils/timeOfDay';
import { VerificationBanner } from '@/components/VerificationBanner';
import { GlyphCoin } from '@/components/GlyphIcon';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '@/app/navigation/MainTabNavigator';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

/**
 * Screen 19 of the UI/UX Screen Bible, now the Home tab. Refetches
 * progression every time Home regains focus (e.g. returning from Quest
 * Complete) so the numbers shown are never stale — always the server's
 * snapshot, never a locally incremented guess. Journey/Compete/Profile
 * moved to their own tabs, so this screen is now purely the dashboard —
 * stats plus a quick way into today's quest, not a menu of links.
 */
export function HomeScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const displayName = useAuthStore((s) => s.user?.displayName);
  const [progression, setProgression] = useState<Progression | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getMyProgression(accessToken)
      .then(setProgression)
      .catch(() => setError('Could not reach the WordQuest backend.'));
  }, [accessToken]);

  useEffect(load, [load]);
  useFocusEffect(load);

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>
        {timeOfDayGreeting()}
        {displayName ? `, ${displayName}` : ''}
      </Text>
      <Text style={styles.title}>Home</Text>

      <VerificationBanner onPress={() => navigation.navigate('Settings')} />

      {!progression && !error && <ActivityIndicator color={colors.arcaneSoft} />}
      {error && <Text style={styles.error}>{error}</Text>}

      {progression && (
        <View style={styles.statsRow}>
          <Pressable
            style={styles.stat}
            onPress={() =>
              navigation.navigate('LevelRoadmap', {
                currentLevel: progression.level,
                totalXp: progression.totalXp,
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Level"
          >
            <Text style={styles.statValue}>{progression.level}</Text>
            <Text style={styles.statLabel}>Level</Text>
          </Pressable>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{progression.totalXp}</Text>
            <Text style={styles.statLabel}>Total XP</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.warning }]}>
              {progression.currentStreak}
            </Text>
            <Text style={styles.statLabel}>Day streak</Text>
          </View>
          <View style={styles.stat}>
            <View style={styles.glyphValueRow}>
              <GlyphCoin size={20} />
              <Text style={[styles.statValue, { color: colors.glyph }]}>
                {progression.glyphBalance}
              </Text>
            </View>
            <Text style={styles.statLabel}>Glyphs</Text>
          </View>
          <Pressable
            style={styles.stat}
            onPress={() => navigation.navigate('WordMastery')}
            accessibilityRole="button"
            accessibilityLabel="Words mastered"
          >
            <Text style={styles.statValue}>{progression.masteredWordsCount}</Text>
            <Text style={styles.statLabel}>Words mastered</Text>
          </Pressable>
          <Pressable
            style={styles.stat}
            onPress={() => navigation.navigate('BossBattle')}
            accessibilityRole="button"
            accessibilityLabel="Boss Battles"
          >
            <Text style={styles.statValue}>{progression.bossBattlesCompleted}</Text>
            <Text style={styles.statLabel}>Boss Battles</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        style={styles.questButton}
        onPress={() => navigation.navigate('Main', { screen: 'Quest' })}
        accessibilityRole="button"
        accessibilityLabel="Go to Quests"
      >
        <Text style={styles.questButtonText}>Go to Quests</Text>
      </Pressable>

      <View style={styles.linkRow}>
        <Pressable
          style={styles.linkButton}
          onPress={() => navigation.navigate('MasterChallenge')}
          accessibilityRole="button"
          accessibilityLabel="Master Challenge"
        >
          <Text style={styles.linkButtonText}>Master Challenge</Text>
        </Pressable>
        <Pressable
          style={styles.linkButton}
          onPress={() => navigation.navigate('Ali')}
          accessibilityRole="button"
          accessibilityLabel="ALI"
        >
          <Text style={styles.linkButtonText}>ALI</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
  // Home has no native header (MainTabNavigator sets headerShown: false)
  // and renders its own greeting/title as the first content, so it has
  // to account for the status bar itself -- a flat spacing.xl top
  // padding put "Good evening" half under the status bar on notched
  // devices. paddingTop adds the real safe-area inset on top of the
  // usual breathing room instead.
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: topInset + spacing.md,
    gap: spacing.lg,
  },
  greeting: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '700' },
  title: {
    color: colors.ink,
    fontSize: typography.scale.xl,
    fontWeight: typography.display.weight,
  },
  error: { color: colors.danger, fontSize: typography.scale.sm },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  stat: {
    flexBasis: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  statValue: {
    color: colors.ink,
    fontSize: typography.scale.xl,
    fontWeight: typography.display.weight,
  },
  statLabel: { color: colors.inkMuted, fontSize: typography.scale.sm },
  glyphValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  questButton: {
    marginTop: 'auto',
    backgroundColor: colors.arcane,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  questButtonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
  linkRow: { flexDirection: 'row', gap: spacing.sm },
  linkButton: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  linkButtonText: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '700' },
  });
}
