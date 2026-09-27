import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Arcade'>;

/**
 * WordQuest Arcade hub (spec §12: "Arcade landing screen contains three
 * game cards"). ScrambleQuest is the only game live so far (Phase 2);
 * Word Duel and Complete It show as disabled "coming soon" cards until
 * their own phases land, rather than hiding them and leaving the hub
 * looking incomplete.
 */
export function ArcadeScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('arcade');

  return (
    <ScrollView style={styles.flexFill} contentContainerStyle={styles.container}>
      <BackButton onPress={() => navigation.goBack()} />

      <View style={styles.header}>
        <Text style={styles.title}>{t('title')}</Text>
        <Text style={styles.subtitle}>{t('subtitle')}</Text>
      </View>

      <GameCard
        title={t('scrambleQuestTitle')}
        subtitle={t('scrambleQuestSubtitle')}
        cta={t('play')}
        enabled
        onPress={() => navigation.navigate('ScrambleQuest')}
        styles={styles}
      />
      <GameCard
        title={t('wordDuelTitle')}
        subtitle={t('wordDuelSubtitle')}
        cta={t('comingSoon')}
        enabled={false}
        onPress={() => {}}
        styles={styles}
      />
      <GameCard
        title={t('completeItTitle')}
        subtitle={t('completeItSubtitle')}
        cta={t('comingSoon')}
        enabled={false}
        onPress={() => {}}
        styles={styles}
      />
    </ScrollView>
  );
}

function GameCard({
  title,
  subtitle,
  cta,
  enabled,
  onPress,
  styles,
}: {
  title: string;
  subtitle: string;
  cta: string;
  enabled: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      style={[styles.card, !enabled && styles.cardDisabled]}
      onPress={enabled ? onPress : undefined}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.cardTextCol}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      <View style={[styles.cardCta, !enabled && styles.cardCtaDisabled]}>
        <Text style={[styles.cardCtaText, !enabled && styles.cardCtaTextDisabled]}>{cta}</Text>
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    flexFill: { flex: 1 },
    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      paddingTop: topInset + spacing.md,
      gap: spacing.lg,
    },
    header: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
    title: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    cardDisabled: { opacity: 0.6 },
    cardTextCol: { flex: 1, gap: spacing.xs },
    cardTitle: { color: colors.ink, fontSize: typography.scale.lg, fontWeight: '700' },
    cardSubtitle: { color: colors.inkMuted, fontSize: typography.scale.sm },
    cardCta: {
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    cardCtaDisabled: { backgroundColor: colors.surfaceRaised },
    cardCtaText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    cardCtaTextDisabled: { color: colors.inkMuted },
  });
}
