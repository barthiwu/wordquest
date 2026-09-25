import { useCallback, useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { getShopCatalog, purchaseShopItem, type ShopItem } from '@/services/shop';
import { getMyProgression } from '@/services/progression';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import { GlyphCoin } from '@/components/GlyphIcon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Shop'>;

/**
 * The Glyph shop (spec §9) — cosmetic ALI outfits/accessories bought with
 * Glyphs. Deliberately no equip/wear state here, matching the backend's
 * own "foundation" framing: pricing/inventory/ownership only.
 */
export function ShopScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('shop');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [glyphBalance, setGlyphBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    Promise.all([getShopCatalog(accessToken), getMyProgression(accessToken)])
      .then(([catalog, progression]) => {
        setItems(catalog);
        setGlyphBalance(progression.glyphBalance);
      })
      .catch(() => setError(t('errorLoad')));
  }, [accessToken, t]);

  useFocusEffect(load);

  const onPurchase = async (item: ShopItem) => {
    if (!accessToken || purchasingId) return;
    setPurchasingId(item.id);
    setMessage(null);
    try {
      await purchaseShopItem(accessToken, item.id);
      setMessage(t('purchaseSuccess', { name: item.name }));
      load();
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.status === 400
          ? t('errorInsufficientGlyphs')
          : t('errorPurchase'),
      );
    } finally {
      setPurchasingId(null);
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

  if (!items) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('title')}</Text>
        {glyphBalance !== null && (
          <View style={styles.balanceRow}>
            <GlyphCoin size={18} />
            <Text style={styles.balance}>{t('glyphBalance', { count: glyphBalance })}</Text>
          </View>
        )}
      </View>

      {message && <Text style={styles.message}>{message}</Text>}

      {items.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('emptyText')}</Text>
        </View>
      )}

      {items.map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <View style={styles.priceRow}>
              <GlyphCoin size={15} />
              <Text style={styles.cardPrice}>{t('itemPrice', { count: item.priceGlyphs })}</Text>
            </View>
          </View>
          <Text style={styles.cardBody}>{item.description}</Text>
          <Pressable
            style={[
              styles.buyButton,
              (item.owned || purchasingId === item.id) && styles.buyButtonDisabled,
            ]}
            onPress={() => onPurchase(item)}
            disabled={item.owned || purchasingId !== null}
            accessibilityRole="button"
            accessibilityLabel={
              item.owned
                ? t('itemOwnedLabel', { name: item.name })
                : t('purchaseLabel', { name: item.name })
            }
          >
            {purchasingId === item.id ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.buyButtonText}>{item.owned ? t('owned') : t('purchase')}</Text>
            )}
          </Pressable>
        </View>
      ))}
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
    error: { color: colors.danger, fontSize: typography.scale.md },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    balance: { color: colors.glyph, fontSize: typography.scale.md, fontWeight: '700' },
    balanceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    message: { color: colors.arcaneSoft, fontSize: typography.scale.sm },
    empty: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    emptyText: { color: colors.inkMuted, fontSize: typography.scale.sm },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    cardPrice: { color: colors.glyph, fontSize: typography.scale.sm, fontWeight: '700' },
    priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    cardBody: { color: colors.inkMuted, fontSize: typography.scale.sm },
    buyButton: {
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    buyButtonDisabled: { backgroundColor: colors.surfaceRaised },
    buyButtonText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
  });
}
