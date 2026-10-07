import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { ShareResultButton } from '@/components/resultCard/ShareResultButton';
import { buildVersusResultCard } from '@/components/resultCard/buildData';
import { getVersusMatch, type VersusMatch } from '@/services/arcadeVersus';

const POLL_MS = 3000;

/** "3 correct, 42s" -- seconds, one decimal under ten. */
function seconds(ms: number): string {
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

/**
 * The head-to-head verdict, shown under a finished session. While the
 * opponent is still playing it says so and keeps polling; once the match is
 * settled it shows the winner and both scores.
 */
export function VersusResultCard({ matchId }: { matchId: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation('arcade');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [match, setMatch] = useState<VersusMatch | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!accessToken) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      getVersusMatch(accessToken, matchId)
        .then((m) => {
          if (!alive.current) return;
          setMatch(m);
          if (!m.result) timer = setTimeout(tick, POLL_MS);
        })
        .catch(() => {
          if (alive.current) timer = setTimeout(tick, POLL_MS * 2);
        });
    };
    tick();
    return () => {
      alive.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [accessToken, matchId]);

  const name = match?.opponent?.username ?? '';
  const user = useAuthStore((s) => s.user);
  const shareData = useMemo(
    () =>
      match?.result
        ? buildVersusResultCard(t, {
            game: match.game,
            outcome: match.result.outcome,
            me: {
              name: user?.username ?? '',
              avatarUrl: user?.avatarUrl,
              correct: match.result.myCorrect,
              timeMs: match.result.myTimeMs,
            },
            them: {
              name,
              avatarUrl: match.opponent?.avatarUrl,
              correct: match.result.theirCorrect,
              timeMs: match.result.theirTimeMs,
            },
            total: match.wordsTotal,
          })
        : null,
    [match, name, t, user],
  );

  if (!match || !match.result) {
    return (
      <View style={styles.card} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.arcaneSoft} />
        <Text style={styles.waiting}>
          {match?.kind === 'FRIEND'
            ? t('versus.result.waitingFriend', { name })
            : t('versus.result.waiting', { name })}
        </Text>
      </View>
    );
  }

  const r = match.result;
  const headline =
    r.outcome === 'WIN'
      ? t('versus.result.win')
      : r.outcome === 'LOSS'
        ? t('versus.result.loss', { name })
        : r.outcome === 'DRAW'
          ? t('versus.result.draw')
          : t('versus.result.noContest');
  const tone =
    r.outcome === 'WIN' ? colors.success : r.outcome === 'LOSS' ? colors.danger : colors.inkMuted;

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <Text style={[styles.headline, { color: tone }]}>{headline}</Text>
      {r.reason === 'FORFEIT' && (
        <Text style={styles.note}>
          {r.outcome === 'WIN' ? t('versus.result.theyLeft', { name }) : t('versus.result.youLeft')}
        </Text>
      )}
      <View style={styles.scores}>
        <View style={styles.scoreCol}>
          <Text style={styles.scoreWho}>{t('versus.bar.you')}</Text>
          <Text style={styles.scoreNum}>{r.myCorrect}</Text>
          <Text style={styles.scoreTime}>{seconds(r.myTimeMs)}</Text>
        </View>
        <Text style={styles.scoreVs}>{t('versus.result.vs')}</Text>
        <View style={styles.scoreCol}>
          <Text style={styles.scoreWho} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.scoreNum}>{r.theirCorrect}</Text>
          <Text style={styles.scoreTime}>{seconds(r.theirTimeMs)}</Text>
        </View>
      </View>
      <Text style={styles.note}>{t('versus.result.scoreRule')}</Text>
      {r.bonusXp > 0 && (
        <Text style={styles.bonus}>{t('versus.result.bonus', { xp: r.bonusXp })}</Text>
      )}
      <ShareResultButton data={shareData} variant="quest" fileName={`wordquest-${match.game.toLowerCase()}`} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      width: '100%',
      maxWidth: 420,
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    waiting: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
    headline: { fontSize: typography.scale.lg, fontWeight: '800', textAlign: 'center' },
    note: { color: colors.inkMuted, fontSize: typography.scale.xs, textAlign: 'center' },
    scores: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      paddingVertical: spacing.sm,
    },
    scoreCol: { alignItems: 'center', minWidth: 80, maxWidth: 140 },
    scoreWho: { color: colors.inkMuted, fontSize: typography.scale.xs, fontWeight: '700' },
    scoreNum: { color: colors.ink, fontSize: typography.scale.xl, fontWeight: '800' },
    scoreTime: { color: colors.inkMuted, fontSize: typography.scale.xs },
    scoreVs: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
    bonus: { color: colors.glyph, fontSize: typography.scale.sm, fontWeight: '700' },
  });
}
