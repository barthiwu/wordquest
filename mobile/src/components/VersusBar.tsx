import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { getVersusMatch, type VersusMatch } from '@/services/arcadeVersus';
import { AvatarBubble } from './AvatarBubble';

const POLL_MS = 3000;

/**
 * Slim strip shown above a head-to-head game: who you are playing and how
 * far each of you has got. Progress only (words answered), never anyone's
 * score -- that is revealed on the result card once the match is settled.
 */
export function VersusBar({ matchId }: { matchId: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation('arcade');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [match, setMatch] = useState<VersusMatch | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!accessToken) return undefined;
    const tick = () => {
      getVersusMatch(accessToken, matchId)
        .then((m) => alive.current && setMatch(m))
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [accessToken, matchId]);

  if (!match?.opponent) return null;
  const total = match.wordsTotal ?? 0;
  const frac = (n: number) => (total > 0 ? Math.min(1, n / total) : 0);
  const them = match.opponentProgress;
  const me = match.me;

  return (
    <View style={styles.bar} accessibilityRole="summary">
      <AvatarBubble
        colors={colors}
        avatarUrl={match.opponent.avatarUrl}
        username={match.opponent.username}
        size={28}
      />
      <View style={styles.body}>
        <Text style={styles.vs} numberOfLines={1}>
          {t('versus.bar.vs', { name: match.opponent.username })}
        </Text>
        <View style={styles.row}>
          <Text style={styles.label}>{t('versus.bar.you')}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${frac(me.answered) * 100}%` }]} />
          </View>
        </View>
        <View style={styles.row}>
          <Text style={styles.label} numberOfLines={1}>
            {them.finished ? t('versus.bar.done') : t('versus.bar.them')}
          </Text>
          <View style={styles.track}>
            <View
              style={[styles.fill, styles.fillThem, { width: `${frac(them.answered) * 100}%` }]}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    body: { flex: 1, gap: 4 },
    vs: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    label: { width: 52, color: colors.inkMuted, fontSize: typography.scale.xs },
    track: {
      flex: 1,
      height: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.arcaneSoft },
    fillThem: { backgroundColor: colors.glyph },
  });
}
