import { useCallback, useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import {
  getMyOrder,
  getOrderCatalog,
  selectOrder,
  type MyOrder,
  type OrderCatalogEntry,
  type OrderName,
} from '@/services/order';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Order'>;

/**
 * The Order (Final Core Progression Spec §5) — a Kingdom-level identity
 * system with zero gameplay effect (§5.4: changing Order never resets
 * Level, Journey, mastery, or achievements). Gated by Kingdom stage and
 * a 30-day cooldown between changes — both enforced server-side; this
 * screen just reflects `changeEligibleAt` rather than re-deriving it.
 */
export function OrderScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('order');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [catalog, setCatalog] = useState<OrderCatalogEntry[] | null>(null);
  const [current, setCurrent] = useState<MyOrder | null>(null);
  const [selecting, setSelecting] = useState<OrderName | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    Promise.all([getOrderCatalog(accessToken), getMyOrder(accessToken)])
      .then(([c, m]) => {
        setCatalog(c);
        setCurrent(m);
      })
      .catch(() => setError(t('errorLoad')));
  }, [accessToken, t]);

  useFocusEffect(load);

  const changeLocked = current?.changeEligibleAt
    ? new Date(current.changeEligibleAt) > new Date()
    : false;

  const onSelect = async (order: OrderName) => {
    if (!accessToken || selecting || changeLocked || current?.current === order) return;
    setSelecting(order);
    setError(null);
    try {
      const result = await selectOrder(accessToken, order);
      setCurrent(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errorSelect'));
    } finally {
      setSelecting(null);
    }
  };

  if (error && !catalog) {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!catalog || !current) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('title')}</Text>
      <Text style={styles.subtitle}>
        {current.current
          ? t('subtitleCurrent', {
              name: catalog.find((o) => o.key === current.current)?.name ?? current.current,
            })
          : t('subtitleChoose')}
      </Text>
      {changeLocked && current.changeEligibleAt && (
        <Text style={styles.cooldown}>
          {t('cooldown', { date: new Date(current.changeEligibleAt).toLocaleDateString() })}
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {catalog.map((entry) => {
        const isCurrent = current.current === entry.key;
        return (
          <Pressable
            key={entry.key}
            style={[styles.card, isCurrent && styles.cardSelected]}
            onPress={() => onSelect(entry.key)}
            disabled={selecting !== null || (changeLocked && !isCurrent)}
            accessibilityRole="button"
            accessibilityLabel={
              isCurrent
                ? t('cardCurrentLabel', { name: entry.name })
                : t('cardSelectLabel', { name: entry.name })
            }
          >
            <Text style={styles.cardName}>
              {entry.name} {isCurrent ? t('currentSuffix') : ''}
            </Text>
            <Text style={styles.cardSymbol}>{entry.symbol}</Text>
            <Text style={styles.cardMotto}>“{entry.motto}”</Text>
            <Text style={styles.cardPhilosophy}>{entry.philosophy}</Text>
            {selecting === entry.key && <ActivityIndicator color={colors.arcaneSoft} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.xl, paddingTop: topInset + spacing.xxl, gap: spacing.md },
    centered: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    error: { color: colors.danger, fontSize: typography.scale.sm },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.md },
    cooldown: { color: colors.warning, fontSize: typography.scale.sm },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: 2,
    },
    cardSelected: { borderColor: colors.arcane, backgroundColor: colors.surfaceRaised },
    cardName: { color: colors.ink, fontSize: typography.scale.lg, fontWeight: '700' },
    cardSymbol: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.xs,
      textTransform: 'uppercase',
    },
    cardMotto: { color: colors.ink, fontSize: typography.scale.sm, fontStyle: 'italic' },
    cardPhilosophy: { color: colors.inkMuted, fontSize: typography.scale.sm },
  });
}
