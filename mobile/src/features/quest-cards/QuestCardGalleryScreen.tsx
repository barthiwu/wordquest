import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radius, spacing, typography } from '@/constants/theme';
import {
  MAX_SHOWCASE_CARDS,
  getMyQuestCards,
  setMyShowcase,
  type QuestCard,
} from '@/services/questCards';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'QuestCardGallery'>;

const RARITY_COLORS: Record<QuestCard['rarity'], string> = {
  COMMON: colors.inkMuted,
  RARE: colors.arcaneSoft,
  EPIC: colors.glyph,
  LEGENDARY: colors.warning,
};

/**
 * Quest Card gallery — "permanent identity collectibles" (Final Core
 * Progression Spec §6.7) earned from Journey/Achievement/Boss Battle
 * milestones. Grid of what's been earned so far; tapping a card opens
 * its full detail/share view.
 *
 * Also owns showcase selection (V22 §7/§9 finding: the setShowcase/
 * listShowcase endpoints existed and worked but nothing in the app
 * called them) — a star toggle per card, up to MAX_SHOWCASE_CARDS,
 * saved explicitly rather than on every tap so a player can freely
 * change their mind before committing.
 */
export function QuestCardGalleryScreen({ navigation }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [cards, setCards] = useState<QuestCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getMyQuestCards(accessToken)
      .then((result) => {
        setCards(result);
        setSelected(
          result
            .filter((c) => c.isShowcased)
            .sort((a, b) => (a.showcaseOrder ?? 0) - (b.showcaseOrder ?? 0))
            .map((c) => c.id),
        );
      })
      .catch(() => setError('Could not load your Quest Cards.'));
  }, [accessToken]);

  useFocusEffect(load);

  const dirty =
    cards != null &&
    JSON.stringify(selected) !==
      JSON.stringify(
        cards
          .filter((c) => c.isShowcased)
          .sort((a, b) => (a.showcaseOrder ?? 0) - (b.showcaseOrder ?? 0))
          .map((c) => c.id),
      );

  const toggleShowcase = (cardId: string) => {
    setSaveError(null);
    setSelected((prev) =>
      prev.includes(cardId)
        ? prev.filter((id) => id !== cardId)
        : prev.length >= MAX_SHOWCASE_CARDS
          ? prev
          : [...prev, cardId],
    );
  };

  const onSaveShowcase = async () => {
    if (!accessToken) return;
    setSaving(true);
    setSaveError(null);
    try {
      await setMyShowcase(accessToken, selected);
      load();
    } catch {
      setSaveError('Could not save your showcase. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!cards) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Quest Cards</Text>
      <Text style={styles.subtitle}>
        {cards.length} earned · {selected.length}/{MAX_SHOWCASE_CARDS} showcased on your profile
      </Text>

      {cards.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No Quest Cards yet — your first one arrives with your next Journey milestone.
          </Text>
        </View>
      )}

      <View style={styles.grid}>
        {cards.map((card) => {
          const isSelected = selected.includes(card.id);
          return (
            <View key={card.id} style={[styles.card, { borderColor: RARITY_COLORS[card.rarity] }]}>
              <Pressable
                onPress={() => navigation.navigate('QuestCardDetail', { id: card.id })}
                accessibilityRole="button"
                accessibilityLabel={`${card.title}, ${card.rarity.toLowerCase()}`}
              >
                <Text style={[styles.rarity, { color: RARITY_COLORS[card.rarity] }]}>
                  {card.rarity}
                </Text>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {card.title}
                </Text>
              </Pressable>
              <Pressable
                style={styles.showcaseToggle}
                onPress={() => toggleShowcase(card.id)}
                accessibilityRole="button"
                accessibilityLabel={
                  isSelected ? `Remove ${card.title} from showcase` : `Showcase ${card.title}`
                }
              >
                <Text
                  style={[styles.showcaseToggleText, isSelected && styles.showcaseToggleActive]}
                >
                  {isSelected ? '★ Showcased' : '☆ Showcase'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      {cards.length > 0 && (
        <View style={styles.saveBar}>
          {saveError && <Text style={styles.error}>{saveError}</Text>}
          <Pressable
            style={[styles.saveButton, (!dirty || saving) && styles.saveButtonDisabled]}
            onPress={onSaveShowcase}
            disabled={!dirty || saving}
            accessibilityRole="button"
            accessibilityLabel="Save showcase"
          >
            <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save showcase'}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.md },
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
  empty: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  emptyText: { color: colors.inkMuted, fontSize: typography.scale.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: {
    flexBasis: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    padding: spacing.md,
    gap: spacing.xs,
    minHeight: 96,
  },
  rarity: {
    fontSize: typography.scale.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cardTitle: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
  showcaseToggle: { marginTop: spacing.xs, alignSelf: 'flex-start' },
  showcaseToggleText: { color: colors.inkMuted, fontSize: typography.scale.xs, fontWeight: '700' },
  showcaseToggleActive: { color: colors.glyph },
  saveBar: { gap: spacing.sm, alignItems: 'flex-start' },
  saveButton: {
    backgroundColor: colors.arcane,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
});
