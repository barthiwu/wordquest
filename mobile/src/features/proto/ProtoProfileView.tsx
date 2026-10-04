import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/state/themeStore';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import type { PassportView } from '@/services/passport';
import { countryCodeToFlagEmoji } from '@/utils/countryFlag';
import { countryNameForCode } from '@/constants/countries';
import { SceneBackdrop } from './ui/SceneBackdrop';
import { GlassCard, IconBadge, Panel, Pill, SectionHeader } from './ui/ProtoUI';
import { ProtoMobileHeader } from './ui/ProtoNav';
import { sceneForStage } from './sceneForStage';

export interface ProtoProfileViewProps {
  passport: PassportView;
  navigate: (route: string, params?: Record<string, unknown>) => void;
}

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Prototype "New look" Profile (Passport): the player's world as a backdrop
 * with their avatar, identity and standing, four stat tiles, CEFR status and
 * the same destination list as the standard Profile. Everything shown is
 * already on PassportView — no new data, no avatar frames or titles.
 */
export function ProtoProfileView({ passport, navigate }: ProtoProfileViewProps) {
  const { t } = useTranslation('passport');
  const colors = useThemeColors();
  const { isMobile } = useBreakpoint();
  const wide = !isMobile;
  const initial = passport.displayName?.trim().charAt(0).toUpperCase() || '?';

  const stats: { icon: IconName; color: string; label: string; value: string; onPress?: () => void }[] = [
    {
      icon: 'star',
      color: '#FFC933',
      label: t('statLabelLevel'),
      value: String(passport.level),
      onPress: () => navigate('LevelRoadmap', { currentLevel: passport.level, totalXp: passport.totalXp }),
    },
    { icon: 'map', color: colors.arcane, label: t('statLabelJourney'), value: passport.journeyStageName },
    {
      icon: 'book',
      color: colors.success,
      label: t('statLabelWordsMastered'),
      value: String(passport.wordsMastered),
      onPress: () => navigate('WordMastery'),
    },
    { icon: 'flame', color: '#FF8A3D', label: t('statLabelLongestStreak'), value: t('statValueDays', { count: passport.longestStreak }) },
  ];

  const rows: { icon: IconName; title: string; subtitle: string; route: string; tint: string }[] = [
    {
      icon: 'trophy-outline',
      title: t('achievementsTitle'),
      subtitle: passport.achievements.length > 0 ? t('achievementsSummary', { count: passport.achievements.length }) : t('achievementsEmpty'),
      route: 'Achievements',
      tint: '#FFC933',
    },
    { icon: 'people-outline', title: t('friendsTitle'), subtitle: t('friendsBody'), route: 'Friends', tint: colors.arcane },
    {
      icon: 'albums-outline',
      title: t('questCardsTitle'),
      subtitle: passport.showcasedCards.length > 0 ? t('questCardsShowcasedCount', { count: passport.showcasedCards.length }) : t('questCardsEmpty'),
      route: 'QuestCardGallery',
      tint: '#C084FC',
    },
    { icon: 'shield-outline', title: t('theOrderTitle'), subtitle: passport.order ? passport.order.name : t('orderEmpty'), route: 'Order', tint: '#34D399' },
    { icon: 'bag-outline', title: t('shopTitle'), subtitle: t('shopBody'), route: 'Shop', tint: '#FB923C' },
    { icon: 'notifications-outline', title: t('notificationsTitle'), subtitle: t('notificationsBody'), route: 'Notifications', tint: '#38BDF8' },
    { icon: 'settings-outline', title: t('settingsTitle'), subtitle: t('settingsBody'), route: 'Settings', tint: colors.inkMuted },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View>
        <SceneBackdrop variant={sceneForStage(passport.journeyStageName)} height={wide ? 230 : 190} fadeTo={wide ? undefined : colors.background} />
        <View style={styles.header} pointerEvents="box-none">
          <ProtoMobileHeader />
        </View>
      </View>

      <View style={[styles.body, wide && styles.bodyWide]}>
        <View style={styles.identity}>
          <View style={[styles.avatarRing, { borderColor: colors.arcane, backgroundColor: colors.surface }]}>
            {passport.avatarUrl ? (
              <Image source={{ uri: passport.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarInitial, { color: colors.ink }]}>{initial}</Text>
            )}
          </View>
          <Text style={[styles.name, { color: colors.ink }]}>{passport.displayName}</Text>
          <Text style={{ color: colors.inkMuted, fontSize: 14 }}>@{passport.username}</Text>
          <View style={styles.pills}>
            <Pill>{passport.clan ? passport.clan.name : t('noClanYet')}</Pill>
            {passport.countryCode ? (
              <Pill color={colors.inkMuted}>
                {`${countryCodeToFlagEmoji(passport.countryCode) ?? ''} ${countryNameForCode(passport.countryCode) ?? passport.countryCode}`}
              </Pill>
            ) : null}
          </View>
        </View>

        <View style={[styles.statGrid, wide && styles.statGridWide]}>
          {stats.map((s) => {
            const body = (
              <GlassCard style={styles.stat}>
                <IconBadge name={s.icon} color={s.color} size={34} />
                <Text style={[styles.statValue, { color: colors.ink }]} numberOfLines={1}>{s.value}</Text>
                <Text style={{ color: colors.inkMuted, fontSize: 12, fontWeight: '700' }}>{s.label}</Text>
              </GlassCard>
            );
            return s.onPress ? (
              <Pressable key={s.label} onPress={s.onPress} accessibilityRole="button" accessibilityLabel={s.label} style={[styles.statCell, wide && styles.statCellWide]}>
                {body}
              </Pressable>
            ) : (
              <View key={s.label} style={[styles.statCell, wide && styles.statCellWide]}>{body}</View>
            );
          })}
        </View>

        <Panel style={{ gap: 4 }}>
          <Text style={[styles.cefrTitle, { color: colors.ink }]}>{t('cefrTitle')}</Text>
          <Text style={{ color: colors.inkMuted, fontSize: 14 }}>
            {passport.cefrUnlocked
              ? passport.estimatedCefrLevel
                ? t('cefrUnlockedWithEstimate', { level: passport.estimatedCefrLevel })
                : t('cefrUnlocked')
              : t('cefrNotUnlocked')}
          </Text>
          {passport.estimatedCefrConfidence != null ? (
            <Text style={{ color: colors.arcaneSoft, fontSize: 12, fontWeight: '700' }}>
              {t('confidencePercent', { percent: Math.round(passport.estimatedCefrConfidence * 100) })}
            </Text>
          ) : null}
        </Panel>

        <Panel style={styles.list}>
          {rows.map((r, i) => (
            <Pressable
              key={r.route}
              onPress={() => navigate(r.route)}
              accessibilityRole="button"
              accessibilityLabel={r.title}
              style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
            >
              <IconBadge name={r.icon} color={r.tint} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 15 }} numberOfLines={1}>{r.title}</Text>
                <Text style={{ color: colors.inkMuted, fontSize: 12 }} numberOfLines={1}>{r.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
            </Pressable>
          ))}
        </Panel>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  header: { position: 'absolute', left: 0, right: 0, top: 0 },
  body: { paddingHorizontal: 16, gap: 14, marginTop: -48 },
  bodyWide: { maxWidth: 860, width: '100%', alignSelf: 'center', paddingHorizontal: 24, marginTop: -60 },
  identity: { alignItems: 'center', gap: 4 },
  avatarRing: { width: 96, height: 96, borderRadius: 48, borderWidth: 4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: 88, height: 88, borderRadius: 44 },
  avatarInitial: { fontSize: 38, fontWeight: '900' },
  name: { fontSize: 26, fontWeight: '900', marginTop: 4 },
  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statGridWide: { gap: 14 },
  statCell: { flexBasis: '47%', flexGrow: 1 },
  statCellWide: { flexBasis: '22%' },
  stat: { alignItems: 'flex-start', gap: 4 },
  statValue: { fontSize: 22, fontWeight: '900' },
  cefrTitle: { fontSize: 16, fontWeight: '800' },
  list: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
});
