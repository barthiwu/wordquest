import { useCallback, useState, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useIsNewLook } from '@/state/uiVersionStore';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { getMyPassport, type PassportView } from '@/services/passport';
import { useAuthStore } from '@/state/authStore';
import { countryCodeToFlagEmoji } from '@/utils/countryFlag';
import { countryNameForCode } from '@/constants/countries';
import { FirstTimeTip } from '@/components/FirstTimeTip';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '@/app/navigation/MainTabNavigator';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Profile'>,
  NativeStackScreenProps<RootStackParamList>
>;

/**
 * Screen 28 of the UI/UX Screen Bible, now the Profile tab — reads like
 * a credential, not another settings page (§28). Achievements and Boss
 * Battle history summarize here and open into their own screens for
 * detail; Order and Settings live here too, since Profile is where a
 * player's identity and account both naturally belong.
 */
export function PassportScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const wide = useIsNewLook() && !useBreakpoint().isMobile;
  const styles = useMemo(() => createStyles(colors, insets.top, wide), [colors, insets.top, wide]);
  const { t } = useTranslation('passport');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [passport, setPassport] = useState<PassportView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    setError(null);
    getMyPassport(accessToken)
      .then(setPassport)
      .catch(() => setError(t('loadError')));
  }, [accessToken, t]);

  // Refetch every time the Profile tab regains focus (matching Home),
  // so an earlier failure -- e.g. the backend still coming up -- clears
  // itself on the next visit instead of sticking until the app reloads.
  useFocusEffect(load);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel={t('retry')}
        >
          <Text style={styles.retryButtonText}>{t('retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (!passport) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {/* Editable in Settings > Profile now (Sept 2026 redesign) -- this
            header is a plain identity display, not a second edit entry
            point. */}
        <View style={styles.avatarWrapper}>
          {passport.avatarUrl ? (
            <Image source={{ uri: passport.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {passport.displayName?.trim().charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name}>{passport.displayName}</Text>
          <Text style={styles.username}>@{passport.username}</Text>
          <Text style={styles.meta}>
            {passport.clan ? passport.clan.name : t('noClanYet')}
            {passport.countryCode
              ? ` · ${countryCodeToFlagEmoji(passport.countryCode) ?? ''} ${
                  countryNameForCode(passport.countryCode) ?? passport.countryCode
                }`
              : ''}
          </Text>
        </View>
      </View>

      <FirstTimeTip
        id="passport.intro"
        colors={colors}
        icon="ribbon-outline"
        title={t('tipTitle')}
        body={t('tipBody')}
      />

      <View style={styles.statGrid}>
        <Stat
          label={t('statLabelLevel')}
          value={String(passport.level)}
          onPress={() =>
            navigation.navigate('LevelRoadmap', {
              currentLevel: passport.level,
              totalXp: passport.totalXp,
            })
          }
          styles={styles}
        />
        <Stat label={t('statLabelJourney')} value={passport.journeyStageName} styles={styles} />
        <Stat
          label={t('statLabelWordsMastered')}
          value={String(passport.wordsMastered)}
          onPress={() => navigation.navigate('WordMastery')}
          styles={styles}
        />
        <Stat
          label={t('statLabelLongestStreak')}
          value={t('statValueDays', { count: passport.longestStreak })}
          styles={styles}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('cefrTitle')}</Text>
        <Text style={styles.sectionBody}>
          {passport.cefrUnlocked
            ? passport.estimatedCefrLevel
              ? t('cefrUnlockedWithEstimate', { level: passport.estimatedCefrLevel })
              : t('cefrUnlocked')
            : t('cefrNotUnlocked')}
        </Text>
        {/* V22 §8 finding: confidence was computed server-side but never
            shown anywhere — surfaced here as a rounded percentage next
            to the estimate it backs. */}
        {passport.estimatedCefrConfidence != null && (
          <Text style={styles.sectionMeta}>
            {t('confidencePercent', {
              percent: Math.round(passport.estimatedCefrConfidence * 100),
            })}
          </Text>
        )}
      </View>

      {/* Redesign (Sept 2026, Barth): Achievements-through-Settings used to
          be seven separate bordered cards (plus a now-removed Boss Battle
          history card -- Boss Battle's own screen, reachable from Compete,
          already shows that history, so surfacing it twice was redundant).
          Collapsed into one icon-led list, "Option B" from the design
          review -- shorter scroll, easier to scan. Achievements and Quest
          Cards trade their inline detail (the full achievement-name list /
          showcased-card chips) for a plain count; the detail is still one
          tap away on each row's own screen. */}
      <View style={styles.listCard}>
        <ListRow
          icon="trophy-outline"
          title={t('achievementsTitle')}
          subtitle={
            passport.achievements.length > 0
              ? t('achievementsSummary', { count: passport.achievements.length })
              : t('achievementsEmpty')
          }
          onPress={() => navigation.navigate('Achievements')}
          styles={styles}
          colors={colors}
        />
        <ListRow
          icon="people-outline"
          title={t('friendsTitle')}
          subtitle={t('friendsBody')}
          onPress={() => navigation.navigate('Friends')}
          styles={styles}
          colors={colors}
        />
        <ListRow
          icon="albums-outline"
          title={t('questCardsTitle')}
          subtitle={
            passport.showcasedCards.length > 0
              ? t('questCardsShowcasedCount', { count: passport.showcasedCards.length })
              : t('questCardsEmpty')
          }
          onPress={() => navigation.navigate('QuestCardGallery')}
          styles={styles}
          colors={colors}
        />
        <ListRow
          icon="shield-outline"
          title={t('theOrderTitle')}
          subtitle={passport.order ? passport.order.name : t('orderEmpty')}
          onPress={() => navigation.navigate('Order')}
          styles={styles}
          colors={colors}
        />
        <ListRow
          icon="bag-outline"
          title={t('shopTitle')}
          subtitle={t('shopBody')}
          onPress={() => navigation.navigate('Shop')}
          styles={styles}
          colors={colors}
        />
        <ListRow
          icon="notifications-outline"
          title={t('notificationsTitle')}
          subtitle={t('notificationsBody')}
          onPress={() => navigation.navigate('Notifications')}
          styles={styles}
          colors={colors}
        />
        <ListRow
          icon="settings-outline"
          title={t('settingsTitle')}
          subtitle={t('settingsBody')}
          onPress={() => navigation.navigate('Settings')}
          styles={styles}
          colors={colors}
          isLast
        />
      </View>
    </ScrollView>
  );
}

function Stat({
  label,
  value,
  styles,
  onPress,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={styles.stat}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.stat}>{content}</View>;
}

function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  styles,
  colors,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  isLast?: boolean;
}) {
  return (
    <Pressable
      style={[styles.listRow, isLast && styles.listRowLast]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.listIcon}>
        <Ionicons name={icon} size={17} color={colors.arcaneSoft} />
      </View>
      <View style={styles.listTextCol}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.listSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, topInset: number, wide = false) {
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
    retryButton: {
      marginTop: spacing.md,
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    retryButtonText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    headerText: { gap: 2, flex: 1 },
    avatarWrapper: { position: 'relative' },
    avatarImage: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.surfaceRaised,
    },
    avatarPlaceholder: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      color: colors.inkMuted,
      fontSize: typography.scale.lg,
      fontWeight: typography.display.weight,
    },
    name: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    username: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '600' },
    meta: { color: colors.inkMuted, fontSize: typography.scale.sm },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    stat: {
      flexBasis: wide ? 200 : '47%',
      flexGrow: wide ? 1 : 0,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: 2,
    },
    statValue: {
      color: colors.ink,
      fontSize: typography.scale.lg,
      fontWeight: typography.display.weight,
    },
    statLabel: { color: colors.inkMuted, fontSize: typography.scale.xs },
    section: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: 4,
    },
    sectionTitle: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    sectionBody: { color: colors.inkMuted, fontSize: typography.scale.sm },
    sectionMeta: { color: colors.arcaneSoft, fontSize: typography.scale.xs },
    listCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    listRowLast: { borderBottomWidth: 0 },
    listIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listTextCol: { flex: 1, gap: 2 },
    listTitle: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '600' },
    listSubtitle: { color: colors.inkMuted, fontSize: typography.scale.xs },
  });
}
