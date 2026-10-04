import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/state/themeStore';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { AvatarBubble } from '@/components/AvatarBubble';
import { ReportButton } from '@/components/ReportButton';
import { countryCodeToFlagEmoji } from '@/utils/countryFlag';
import type { LeaderboardEntry, LeaderboardView } from '@/services/leaderboards';
import { AliScene } from './ui/AliScene';
import { GlassCard, Panel } from './ui/ProtoUI';
import { ProtoMobileHeader } from './ui/ProtoNav';
import { CrownArt } from './ui/ProtoArt';

export interface ProtoLeaderboardViewProps {
  tabs: { key: string; label: string }[];
  category: string;
  onCategory: (key: string) => void;
  view: LeaderboardView | null;
  error: string | null;
  emptyMessage: string;
  showLevel: boolean;
}

const MEDALS = ['#F5C542', '#C7D0DC', '#D98B4A'];

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const colors = useThemeColors();
  const { t } = useTranslation('leaderboards');
  // Visual order: 2nd · 1st · 3rd
  const order = [entries[1], entries[0], entries[2]];
  return (
    <View style={styles.podium}>
      {order.map((e, i) => {
        if (!e) return <View key={`empty-${i}`} style={styles.podiumCol} />;
        const first = e.rank === 1;
        const medal = MEDALS[Math.min(e.rank, 3) - 1];
        return (
          <View key={e.userId} style={[styles.podiumCol, { marginTop: first ? 0 : 22 }]}>
            {first ? <CrownArt size={34} /> : null}
            <View style={[styles.podiumAvatar, { borderColor: medal }]}>
              <AvatarBubble colors={colors} avatarUrl={null} username={e.username} size={first ? 64 : 52} />
              <View style={[styles.medal, { backgroundColor: medal }]}>
                <Text style={styles.medalText}>{e.rank}</Text>
              </View>
            </View>
            <Text style={[styles.podiumName, { color: colors.ink }]} numberOfLines={1}>
              {e.countryCode ? `${countryCodeToFlagEmoji(e.countryCode) ?? ''} ` : ''}
              {e.username}
            </Text>
            <Text style={{ color: colors.glyph, fontSize: 13, fontWeight: '800' }}>{t('xpValue', { xp: e.totalXp })}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Prototype "New look" Leaderboard: ALI over the arena, tab pills, a top-3
 * podium and the full ranking, with the viewer's own rank pinned. Same
 * categories, same server data as the standard screen (no Continental
 * board — it was never part of the product).
 */
export function ProtoLeaderboardView(p: ProtoLeaderboardViewProps) {
  const colors = useThemeColors();
  const { t } = useTranslation('leaderboards');
  const { t: tp } = useTranslation('proto');
  const { isMobile } = useBreakpoint();
  const wide = !isMobile;
  const rest = p.view ? p.view.entries.slice(3) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <AliScene
          variant="arena"
          height={wide ? 230 : 230}
          aliSize={wide ? 180 : 118}
          bubbleTop={wide ? undefined : 58}
          expression="PROUD"
          pose="APPROVING_NOD"
          message={tp('boardBubble')}
          fadeTo={wide ? undefined : colors.background}
        >
          <View style={styles.header} pointerEvents="box-none">
            <ProtoMobileHeader />
          </View>
        </AliScene>

        <View style={[styles.body, wide && styles.bodyWide]}>
          <Text style={[styles.title, { color: colors.ink }]}>{t('title')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {p.tabs.map((tab) => {
              const active = tab.key === p.category;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => p.onCategory(tab.key)}
                  accessibilityRole="button"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: active }}
                  style={[styles.tab, { borderColor: active ? colors.arcane : colors.border, backgroundColor: active ? `${colors.arcane}2B` : colors.surface }]}
                >
                  <Text style={{ color: active ? colors.arcaneSoft : colors.inkMuted, fontWeight: '800', fontSize: 14 }}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {!p.view && !p.error ? <ActivityIndicator color={colors.arcaneSoft} style={{ marginTop: 30 }} /> : null}
          {p.error ? <Text style={{ color: colors.danger, textAlign: 'center', marginTop: 20 }}>{p.error}</Text> : null}
          {p.view && p.view.entries.length === 0 ? (
            <Text style={{ color: colors.inkMuted, textAlign: 'center', marginTop: 20 }}>{p.emptyMessage}</Text>
          ) : null}

          {p.view && p.view.entries.length > 0 ? (
            <>
              <GlassCard style={styles.podiumCard}>
                <Podium entries={p.view.entries.slice(0, 3)} />
              </GlassCard>
              {rest.length > 0 ? (
                <Panel style={styles.list}>
                  {rest.map((e, i) => {
                    const me = e.userId === p.view!.viewer.userId;
                    return (
                      <View
                        key={e.userId}
                        style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }, me && { backgroundColor: `${colors.arcane}1F` }]}
                      >
                        <Text style={[styles.rank, { color: colors.inkMuted }]}>#{e.rank}</Text>
                        <AvatarBubble colors={colors} avatarUrl={null} username={e.username} size={36} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 15 }} numberOfLines={1}>
                            {e.countryCode ? `${countryCodeToFlagEmoji(e.countryCode) ?? ''} ` : ''}
                            {e.username}
                          </Text>
                          <Text style={{ color: colors.inkMuted, fontSize: 12 }} numberOfLines={1}>
                            {p.showLevel ? t('levelLabel', { level: e.level }) : ''}
                            {e.clanName ? `${p.showLevel ? ' · ' : ''}${e.clanName}` : ''}
                          </Text>
                        </View>
                        <Text style={{ color: colors.glyph, fontWeight: '800', fontSize: 14 }}>{t('xpValue', { xp: e.totalXp })}</Text>
                        {!me ? <ReportButton targetType="USER" targetId={e.userId} label={e.username} /> : null}
                      </View>
                    );
                  })}
                </Panel>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>

      {p.view ? (
        <View style={[styles.viewer, { backgroundColor: colors.surface, borderTopColor: colors.arcane }]}>
          <Text style={[styles.viewerRank, { color: colors.arcaneSoft }]}>#{p.view.viewer.rank}</Text>
          <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 15, flex: 1 }}>{t('you')}</Text>
          <Text style={{ color: colors.glyph, fontWeight: '800', fontSize: 15 }}>{t('xpValue', { xp: p.view.viewer.totalXp })}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 24 },
  header: { position: 'absolute', left: 0, right: 0, top: 0 },
  body: { paddingHorizontal: 16, gap: 14, marginTop: -12 },
  bodyWide: { maxWidth: 860, width: '100%', alignSelf: 'center', paddingHorizontal: 24, marginTop: 18 },
  title: { fontSize: 26, fontWeight: '900' },
  tabs: { gap: 8, paddingRight: 8 },
  tab: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  podiumCard: { paddingVertical: 18 },
  podium: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start' },
  podiumCol: { flex: 1, alignItems: 'center', gap: 4 },
  podiumAvatar: { borderWidth: 3, borderRadius: 40, padding: 2 },
  medal: { position: 'absolute', bottom: -8, alignSelf: 'center', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  medalText: { color: '#1B1405', fontSize: 12, fontWeight: '900' },
  podiumName: { fontSize: 14, fontWeight: '800', marginTop: 10, maxWidth: 110 },
  list: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  rank: { width: 38, fontSize: 14, fontWeight: '800' },
  viewer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 2 },
  viewerRank: { fontSize: 20, fontWeight: '900' },
});
