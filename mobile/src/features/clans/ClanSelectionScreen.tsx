import { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { getClans, type Clan } from '@/services/clans';
import { updateMe } from '@/services/users';
import { useAuthStore } from '@/state/authStore';
import { ReportButton } from '@/components/ReportButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ClanSelection'>;

/**
 * Screen 7 of the UI/UX Screen Bible. Fetches the real clan list from
 * GET /api/v1/clans (seeded via prisma/seed.ts) and persists the choice
 * via PATCH /users/me — this is real selection, not a local-only UI state.
 */
export function ClanSelectionScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('clans');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [clans, setClans] = useState<Clan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getClans()
      .then((result) => !cancelled && setClans(result))
      .catch(() => !cancelled && setError(t('loadError')));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConfirm = async () => {
    if (!selectedId || !accessToken || confirming) return;
    setConfirming(true);
    try {
      await updateMe(accessToken, { clanId: selectedId });
      navigation.replace('Main');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('title')}</Text>
        <Text style={styles.subtitle}>{t('subtitle')}</Text>
      </View>

      {!clans && !error && <ActivityIndicator color={colors.arcaneSoft} style={styles.loader} />}
      {error && <Text style={styles.error}>{error}</Text>}

      {clans && clans.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('emptyText')}</Text>
        </View>
      )}

      {clans && clans.length > 0 && (
        <FlatList
          data={clans}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, selectedId === item.id && styles.cardSelected]}
              onPress={() => setSelectedId(item.id)}
              accessibilityRole="button"
              accessibilityLabel={t('selectLabel', { name: item.name })}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardName}>{item.name}</Text>
                <ReportButton targetType="CLAN" targetId={item.id} label={item.name} />
              </View>
              <Text style={styles.cardDescription}>{item.description}</Text>
            </Pressable>
          )}
        />
      )}

      <Pressable
        style={[styles.confirmButton, !selectedId && styles.confirmButtonDisabled]}
        disabled={!selectedId || confirming}
        onPress={onConfirm}
        accessibilityRole="button"
        accessibilityLabel={t('confirm')}
      >
        {confirming ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <Text style={styles.confirmButtonText}>{t('confirm')}</Text>
        )}
      </Pressable>

      {clans && clans.length === 0 && (
        <Pressable
          style={styles.skipButton}
          onPress={() => navigation.replace('Main')}
          accessibilityRole="button"
          accessibilityLabel={t('skip')}
        >
          <Text style={styles.skipButtonText}>{t('skip')}</Text>
        </Pressable>
      )}
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
      paddingTop: topInset + spacing.xxl * 1.5,
      gap: spacing.lg,
    },
    header: { gap: spacing.xs },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    subtitle: {
      color: colors.inkMuted,
      fontSize: typography.scale.md,
    },
    loader: { marginTop: spacing.xl },
    error: { color: colors.danger, fontSize: typography.scale.sm },
    list: { gap: spacing.sm, paddingBottom: spacing.md },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    cardSelected: {
      borderColor: colors.arcane,
      backgroundColor: colors.surfaceRaised,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    cardName: {
      color: colors.ink,
      fontSize: typography.scale.lg,
      fontWeight: '700',
      flexShrink: 1,
    },
    cardDescription: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
    },
    empty: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    emptyText: { color: colors.inkMuted, fontSize: typography.scale.sm },
    skipButton: { alignItems: 'center', paddingVertical: spacing.sm },
    skipButtonText: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '700' },
    confirmButton: {
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    confirmButtonDisabled: { opacity: 0.5 },
    confirmButtonText: {
      color: colors.ink,
      fontSize: typography.scale.md,
      fontWeight: '700',
    },
  });
}
