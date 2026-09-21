import { useCallback, useState, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { getQuestCard, type QuestCard } from '@/services/questCards';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import { FadeInUp } from '@/components/FadeInUp';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'QuestCardDetail'>;

function getRarityColors(colors: ThemeColors): Record<QuestCard['rarity'], string> {
  return {
    COMMON: colors.inkMuted,
    RARE: colors.arcaneSoft,
    EPIC: colors.glyph,
    LEGENDARY: colors.warning,
  };
}

/** One Quest Card's full detail — the same view used for sharing (owner-only; a card is "permanent identity," not a public link). */
export function QuestCardDetailScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const RARITY_COLORS = useMemo(() => getRarityColors(colors), [colors]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [card, setCard] = useState<QuestCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getQuestCard(accessToken, route.params.id)
      .then(setCard)
      .catch(() => setError('Could not load this Quest Card.'));
  }, [accessToken, route.params.id]);

  useFocusEffect(load);

  if (error) {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!card) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BackButton onPress={() => navigation.goBack()} />
      <FadeInUp style={[styles.card, { borderColor: RARITY_COLORS[card.rarity] }]} distance={24}>
        <Text style={[styles.rarity, { color: RARITY_COLORS[card.rarity] }]}>{card.rarity}</Text>
        <Text style={styles.cardTitle}>{card.title}</Text>
        {card.category && <Text style={styles.category}>{card.category}</Text>}
        <Text style={styles.name}>{card.playerDisplayNameSnapshot}</Text>
        <Text style={styles.earnedAt}>Earned {new Date(card.earnedAt).toLocaleDateString()}</Text>
      </FadeInUp>
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: topInset + spacing.xxl,
    gap: spacing.lg,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.danger, fontSize: typography.scale.md },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.xl,
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rarity: { fontSize: typography.scale.sm, fontWeight: '700', textTransform: 'uppercase' },
  cardTitle: {
    color: colors.ink,
    fontSize: typography.scale.xl,
    fontWeight: typography.display.weight,
    textAlign: 'center',
  },
  category: { color: colors.inkMuted, fontSize: typography.scale.sm },
  name: {
    color: colors.arcaneSoft,
    fontSize: typography.scale.md,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  earnedAt: { color: colors.inkMuted, fontSize: typography.scale.xs },
});
}
