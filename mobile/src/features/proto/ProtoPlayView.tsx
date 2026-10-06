import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/state/themeStore';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { AliScene } from './ui/AliScene';
import { ArcadeArt } from './ui/ProtoArt';
import { GlassCard, Panel, Pill, ProtoButton, SectionHeader } from './ui/ProtoUI';
import { ProtoMobileHeader } from './ui/ProtoNav';

export interface ProtoPlayQuest {
  key: string;
  title: string;
  window: string | null;
  completed: boolean;
  locked: boolean;
  unlockTime: string;
}

export interface ProtoPlayViewProps {
  selected: ProtoPlayQuest | null;
  others: ProtoPlayQuest[];
  allDone: boolean;
  loading: boolean;
  error: string | null;
  onStartQuest: (key: string) => void;
  onSelectQuest: (key: string) => void;
  onPlay: (game: 'SCRAMBLE_QUEST' | 'WORD_DUEL' | 'COMPLETE_IT' | 'HANGMAN' | 'BOSS_BATTLE') => void;
  bossBadge?: string | null;
  /** "7 left today" / "Locked today" for an Arcade tile; null when unlimited. */
  playsBadge?: (game: 'SCRAMBLE_QUEST' | 'WORD_DUEL' | 'COMPLETE_IT' | 'HANGMAN') => { text: string; locked: boolean } | null;
  bossSubtext?: string | null;
}

/**
 * Prototype "New look" Play/Compete hub: ALI over the arena, today's Daily
 * Quest card (window switcher included), the three arcade games, Boss
 * Battle with its countdown. Same data and navigation as the standard hub.
 */
export function ProtoPlayView(p: ProtoPlayViewProps) {
  const { t } = useTranslation(['play', 'quests', 'arcade', 'home', 'common', 'proto']);
  const colors = useThemeColors();
  const { isMobile } = useBreakpoint();
  const wide = !isMobile;

  const games = [
    { id: 'SCRAMBLE_QUEST' as const, kind: 'scramble' as const, title: t('arcade:scrambleQuestTitle'), sub: t('arcade:scrambleQuestSubtitle') },
    { id: 'WORD_DUEL' as const, kind: 'duel' as const, title: t('arcade:wordDuelTitle'), sub: t('arcade:wordDuelSubtitle') },
    { id: 'COMPLETE_IT' as const, kind: 'complete' as const, title: t('arcade:completeItTitle'), sub: t('arcade:completeItSubtitle') },
    { id: 'HANGMAN' as const, kind: 'hangman' as const, title: t('arcade:hangmanTitle'), sub: t('arcade:hangmanSubtitle') },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <AliScene
        variant="arena"
        height={wide ? 250 : 230}
        aliSize={wide ? 200 : 140}
        bubbleTop={wide ? undefined : 58}
        expression="EXCITED"
        pose="WING_TWITCH"
        message={t('proto:playBubble')}
        fadeTo={wide ? undefined : colors.background}
      >
        <View style={styles.header} pointerEvents="box-none">
          <ProtoMobileHeader />
        </View>
      </AliScene>

      <View style={[styles.body, wide && styles.bodyWide]}>
        {p.error ? <Text style={{ color: colors.danger }}>{p.error}</Text> : null}

        {p.selected ? (
          <GlassCard style={styles.questCard}>
            <View style={styles.questTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eyebrow, { color: colors.arcaneSoft }]}>{t('proto:todaysQuest')}</Text>
                <Text style={[styles.questTitle, { color: colors.ink }]}>{p.selected.title}</Text>
                {p.selected.window ? <Text style={{ color: colors.inkMuted, fontSize: 13 }}>{p.selected.window}</Text> : null}
              </View>
              {p.selected.completed ? <Pill color={colors.success}>{t('play:completedBadge')}</Pill> : null}
            </View>

            {p.others.length > 0 ? (
              <View style={styles.windows}>
                {p.others.map((q) => (
                  <Pressable
                    key={q.key}
                    disabled={q.locked}
                    onPress={() => p.onSelectQuest(q.key)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      q.locked
                        ? t('quests:unlocksAtAccessibilityLabel', { title: q.title, time: q.unlockTime })
                        : q.completed
                          ? t('play:completedAccessibilityLabel', { title: q.title })
                          : t('play:selectQuestAccessibilityLabel', { title: q.title })
                    }
                    style={[styles.windowChip, { borderColor: colors.border, opacity: q.locked ? 0.55 : 1 }]}
                  >
                    <Ionicons name={q.locked ? 'lock-closed' : q.completed ? 'checkmark-circle' : 'time-outline'} size={14} color={q.completed ? colors.success : colors.inkMuted} />
                    <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{q.title.replace(/ Quest$/, '')}</Text>
                    {q.locked ? <Text style={{ color: colors.inkMuted, fontSize: 12 }}>{q.unlockTime}</Text> : null}
                  </Pressable>
                ))}
              </View>
            ) : null}

            {p.selected.completed ? null : (
              <ProtoButton
                label={t('play:startQuest')}
                accessibilityLabel={t('quests:startAccessibilityLabel', { title: p.selected.title })}
                trailingIcon="arrow-forward"
                onPress={() => p.onStartQuest(p.selected!.key)}
              />
            )}
            {p.allDone ? <Text style={{ color: colors.inkMuted, fontSize: 13, textAlign: 'center' }}>{t('play:allDoneToday')}</Text> : null}
          </GlassCard>
        ) : null}

        <SectionHeader title={t('proto:arcadeHeading')} caption={t('proto:playAndEarn')} />
        <View style={[styles.tileRow, !wide && styles.tileRowMobile]}>
          {games.map((g) => (
            <Pressable
              key={g.id}
              onPress={() => p.onPlay(g.id)}
              accessibilityRole="button"
              accessibilityLabel={`${g.title}. ${t('arcade:play')}`}
              style={({ pressed }) => [styles.tile, { borderColor: colors.border, backgroundColor: colors.surface }, !wide && styles.tileMobile, pressed && { opacity: 0.85 }]}
            >
              <ArcadeArt kind={g.kind} width={wide ? 260 : 120} height={wide ? 130 : 96} style={[styles.tileArt, !wide && { borderRadius: 12 }]} />
              <View style={styles.tileText}>
                <Text style={[styles.tileTitle, { color: colors.ink }]}>{g.title}</Text>
                <Text style={{ color: colors.inkMuted, fontSize: 13 }} numberOfLines={2}>{g.sub}</Text>
                {p.playsBadge?.(g.id) ? (
                  <Text style={{ color: p.playsBadge(g.id)?.locked ? colors.danger : colors.inkMuted, fontSize: 12, fontWeight: '700' }}>
                    {p.playsBadge(g.id)?.text}
                  </Text>
                ) : null}
                <View style={[styles.playPill, { backgroundColor: `${colors.arcane}26`, borderColor: `${colors.arcane}66` }]}>
                  <Text style={{ color: colors.arcaneSoft, fontWeight: '800', fontSize: 13 }}>{t('arcade:play')}</Text>
                  <Ionicons name="play" size={12} color={colors.arcaneSoft} />
                </View>
              </View>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => p.onPlay('BOSS_BATTLE')}
          accessibilityRole="button"
          accessibilityLabel={`${t('home:bossBattle')}. ${t('arcade:play')}`}
        >
          <Panel style={styles.boss}>
            <ArcadeArt kind="boss" width={wide ? 220 : 104} height={wide ? 120 : 96} style={styles.tileArt} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.tileTitle, { color: colors.ink }]}>{t('home:bossBattle')}</Text>
              <Text style={{ color: colors.inkMuted, fontSize: 13 }} numberOfLines={2}>{t('play:bossBattleSubtitle')}</Text>
              {p.bossBadge ? (
                <View style={styles.bossBadgeRow}>
                  <Pill color={colors.danger}>{p.bossBadge}</Pill>
                  {p.bossSubtext ? <Text style={{ color: colors.inkMuted, fontSize: 12 }}>{p.bossSubtext}</Text> : null}
                </View>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.inkMuted} />
          </Panel>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  header: { position: 'absolute', left: 0, right: 0, top: 0 },
  body: { paddingHorizontal: 16, gap: 14, marginTop: -16 },
  bodyWide: { maxWidth: 1180, width: '100%', alignSelf: 'center', paddingHorizontal: 32, marginTop: 18 },
  questCard: { gap: 12, padding: 16 },
  questTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  questTitle: { fontSize: 22, fontWeight: '900' },
  windows: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  windowChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  tileRowMobile: { flexDirection: 'column', gap: 10 },
  tile: { flexGrow: 1, flexBasis: 240, minWidth: 220, borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  tileMobile: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 12 },
  tileArt: { borderRadius: 0 },
  tileText: { padding: 12, gap: 4, flex: 1 },
  tileTitle: { fontSize: 16, fontWeight: '800' },
  playPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 4 },
  boss: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  bossBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 },
});
