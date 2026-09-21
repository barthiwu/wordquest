import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { FadeInUp } from '@/components/FadeInUp';
import { GlyphCoin } from '@/components/GlyphIcon';
import { AliMarkAnimated } from '@/components/AliMarkAnimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'QuestComplete'>;

/**
 * Screen 16 of the UI/UX Screen Bible. Every number shown here came
 * straight off the server's QuestSummary — nothing is recomputed
 * client-side (§41: the client cannot award itself XP or Glyphs, and it
 * doesn't get to *display* numbers it invented either).
 *
 * V23: ALI's QUEST_COMPLETION reaction is now awaited server-side
 * (quests.service.ts's completeWord) specifically so it can be shown
 * here, before the player leaves — every other ALI trigger stays
 * fire-and-forget and only shows up later on the ALI screen, but this
 * is the one moment ALI is meant to send the player off with something.
 */
export function QuestCompleteScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { xpAwarded, glyphAwarded, correctCount, totalCount, calibrationJustCompleted, aliMessage } =
    route.params;

  return (
    <View style={styles.container}>
      <FadeInUp style={styles.hero}>
        <Text style={styles.title}>Quest Complete</Text>
        <Text style={styles.subtitle}>
          {correctCount} of {totalCount} correct
        </Text>
      </FadeInUp>

      <FadeInUp style={styles.rewards} delay={150}>
        <View style={styles.rewardRow}>
          <Text style={styles.rewardLabel}>XP earned</Text>
          <Text style={styles.rewardValue}>+{xpAwarded}</Text>
        </View>
        <View style={styles.rewardRow}>
          <Text style={styles.rewardLabel}>Glyphs earned</Text>
          <View style={styles.rewardValueRow}>
            <GlyphCoin size={20} />
            <Text style={[styles.rewardValue, { color: colors.glyph }]}>+{glyphAwarded}</Text>
          </View>
        </View>
      </FadeInUp>

      {aliMessage && (
        <FadeInUp style={styles.aliCard} delay={300}>
          <View style={styles.aliIdentity}>
            <AliMarkAnimated size={56} />
            <Text style={styles.aliName}>ALI</Text>
          </View>
          <Text style={styles.aliText}>{aliMessage.text}</Text>
          {aliMessage.recommendation && (
            <Text style={styles.aliRecommendation}>{aliMessage.recommendation}</Text>
          )}
        </FadeInUp>
      )}

      {calibrationJustCompleted && (
        <FadeInUp delay={450}>
          <Pressable
            style={styles.calibrationBanner}
            onPress={() => navigation.replace('CalibrationResult')}
            accessibilityRole="button"
            accessibilityLabel="Your Learning Profile is ready"
            accessibilityHint="Opens your difficulty recommendation"
          >
            <Text style={styles.calibrationTitle}>Your Learning Profile is ready</Text>
            <Text style={styles.calibrationBody}>
              Based on your first 3 words, we have a difficulty recommendation for you — tap to see
              it.
            </Text>
          </Pressable>
        </FadeInUp>
      )}

      <Pressable
        style={styles.button}
        onPress={() => navigation.replace('Main', { screen: 'Home' })}
        accessibilityRole="button"
        accessibilityLabel="See your progress"
      >
        <Text style={styles.buttonText}>See your progress</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
    paddingTop: topInset + spacing.xxl * 2,
    paddingBottom: spacing.xxl,
  },
  hero: { alignItems: 'center', gap: spacing.xs },
  title: {
    color: colors.arcaneSoft,
    fontSize: typography.scale.xxl,
    fontWeight: typography.display.weight,
  },
  subtitle: { color: colors.inkMuted, fontSize: typography.scale.md },
  rewards: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  rewardRow: { flexDirection: 'row', justifyContent: 'space-between' },
  rewardLabel: { color: colors.inkMuted, fontSize: typography.scale.md },
  rewardValue: { color: colors.success, fontSize: typography.scale.md, fontWeight: '700' },
  rewardValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  aliCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.arcaneSoft,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  aliIdentity: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  aliName: {
    color: colors.arcaneSoft,
    fontSize: typography.scale.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  aliText: { color: colors.ink, fontSize: typography.scale.md },
  aliRecommendation: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '700' },
  calibrationBanner: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.arcaneSoft,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  calibrationTitle: { color: colors.arcaneSoft, fontSize: typography.scale.md, fontWeight: '700' },
  calibrationBody: { color: colors.inkMuted, fontSize: typography.scale.sm },
  button: {
    backgroundColor: colors.arcane,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
});
}
