import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { getGroupResults, type ArcadeGroup, type GroupResultSheet } from '@/services/arcadeGroups';
import { formatClock } from './groupFormat';
import { downloadGroupResults } from './groupResultsDownload';
import {
  cellVerdict,
  formatSeconds,
  type CellVerdict,
  type ResultFormat,
} from './groupResultsFormat';

interface Props {
  colors: ThemeColors;
  group: Pick<ArcadeGroup, 'id' | 'title' | 'game' | 'status' | 'endedAt'>;
  accessToken: string;
}

const VERDICT_KEY: Record<CellVerdict, string> = {
  CORRECT: 'arcade:group.sheet.verdict.correct',
  WRONG: 'arcade:group.sheet.verdict.wrong',
  TIMED_OUT: 'arcade:group.sheet.verdict.timedOut',
  NOT_ANSWERED: 'arcade:group.sheet.verdict.notAnswered',
};

/**
 * The host's full result sheet: every player's score and total time, and for
 * each word exactly what they typed, in green when it was right and red when
 * it was wrong. Also the CSV and PDF downloads of the same sheet.
 */
export function GroupResultSheetCard({ colors, group, accessToken }: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation(['arcade']);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<GroupResultSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [exporting, setExporting] = useState<ResultFormat | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSheet(await getGroupResults(accessToken, group.id));
    } catch {
      setError(t('arcade:group.sheet.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, group.id, t]);

  // Opened: read it, and read it again when the round ends so the final numbers show.
  useEffect(() => {
    if (open) void load();
  }, [open, group.status, load]);

  const download = useCallback(
    async (format: ResultFormat) => {
      setExporting(format);
      setError(null);
      try {
        await downloadGroupResults(accessToken, group, format, t('arcade:group.sheet.title'));
      } catch {
        setError(t('arcade:group.sheet.downloadFailed'));
      } finally {
        setExporting(null);
      }
    },
    [accessToken, group, t],
  );

  const toggle = useCallback((userId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const letters = sheet?.typedKind === 'LETTERS';
  const verdictColor = (v: CellVerdict): string =>
    v === 'CORRECT' ? colors.success : v === 'NOT_ANSWERED' ? colors.inkMuted : colors.danger;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('arcade:group.sheet.title')}</Text>
      <Text style={styles.hint}>
        {group.status === 'ENDED'
          ? t('arcade:group.sheet.hintFinal')
          : t('arcade:group.sheet.hintLive')}
      </Text>

      <View style={styles.buttons}>
        {(['csv', 'pdf'] as const).map((format) => (
          <Pressable
            key={format}
            style={[styles.button, exporting !== null && styles.disabled]}
            disabled={exporting !== null}
            onPress={() => void download(format)}
            accessibilityRole="button"
            accessibilityLabel={t(`arcade:group.sheet.download.${format}`)}
          >
            {exporting === format ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.buttonText}>{t(`arcade:group.sheet.download.${format}`)}</Text>
            )}
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? t('arcade:group.sheet.hide') : t('arcade:group.sheet.show')}
      >
        <Text style={styles.link}>
          {open ? t('arcade:group.sheet.hide') : t('arcade:group.sheet.show')}
        </Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {open && loading && !sheet ? <ActivityIndicator color={colors.arcaneSoft} /> : null}

      {open && sheet ? (
        <View style={styles.sheet}>
          <Text style={styles.hint}>
            {letters ? t('arcade:group.sheet.legendLetters') : t('arcade:group.sheet.legend')}
          </Text>
          {sheet.players.map((p) => {
            const isOpen = expanded.has(p.userId);
            return (
              <View key={p.userId} style={styles.player}>
                <Pressable
                  style={styles.playerHeader}
                  onPress={() => toggle(p.userId)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                >
                  <Text style={styles.rank}>{p.rank ?? '–'}</Text>
                  <View style={styles.playerMain}>
                    <Text style={styles.playerName} numberOfLines={1}>
                      {p.name}
                      {p.isHost ? ` (${t('arcade:group.sheet.host')})` : ''}
                    </Text>
                    <Text style={styles.hint}>
                      {p.state === 'NOT_STARTED'
                        ? t('arcade:group.sheet.didNotStart')
                        : `${t('arcade:group.sheet.correctOf', {
                            correct: p.correct,
                            total: sheet.words.length,
                          })}  ·  ${t('arcade:group.sheet.totalTime', {
                            time: formatClock(p.totalTimeMs),
                          })}`}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>{isOpen ? '▾' : '▸'}</Text>
                </Pressable>

                {isOpen && p.state !== 'NOT_STARTED' ? (
                  <View style={styles.rows}>
                    <View style={styles.rowHead}>
                      <Text style={[styles.cellNum, styles.headText]}>#</Text>
                      <Text style={[styles.cellWord, styles.headText]}>
                        {t('arcade:group.sheet.word')}
                      </Text>
                      <Text style={[styles.cellTyped, styles.headText]}>
                        {letters
                          ? t('arcade:group.sheet.lettersGuessed')
                          : t('arcade:group.sheet.typed')}
                      </Text>
                      <Text style={[styles.cellTime, styles.headText]}>
                        {t('arcade:group.sheet.seconds')}
                      </Text>
                    </View>
                    {sheet.words.map((w, i) => {
                      const cell = p.cells[i];
                      const verdict = cellVerdict(cell);
                      const color = verdictColor(verdict);
                      const mark =
                        verdict === 'CORRECT' ? '✓ ' : verdict === 'NOT_ANSWERED' ? '' : '✗ ';
                      const text =
                        cell.typed === null
                          ? '–'
                          : cell.typed === ''
                            ? t('arcade:group.sheet.noAnswer')
                            : cell.typed;
                      return (
                        <View
                          key={w.index}
                          style={styles.row}
                          accessible
                          accessibilityLabel={`${w.index + 1}. ${w.word}. ${text}. ${t(VERDICT_KEY[verdict])}`}
                        >
                          <Text style={styles.cellNum}>{w.index + 1}</Text>
                          <Text style={styles.cellWord} numberOfLines={1}>
                            {w.word}
                          </Text>
                          <Text style={[styles.cellTyped, { color }]} numberOfLines={1}>
                            {mark}
                            {text}
                          </Text>
                          <Text style={styles.cellTime}>
                            {cell.timeMs === null ? '–' : formatSeconds(cell.timeMs)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
    },
    title: { color: colors.ink, fontSize: typography.scale.lg, fontWeight: '800' },
    hint: { color: colors.inkMuted, fontSize: typography.scale.sm },
    buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    button: {
      backgroundColor: colors.arcane,
      borderRadius: radius.pill,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.lg,
      minWidth: 140,
      alignItems: 'center',
    },
    buttonText: { color: '#FFFFFF', fontSize: typography.scale.md, fontWeight: '700' },
    disabled: { opacity: 0.5 },
    link: { color: colors.arcaneSoft, fontSize: typography.scale.md, fontWeight: '700' },
    error: { color: colors.danger, fontSize: typography.scale.sm },
    sheet: { gap: spacing.sm, marginTop: spacing.xs },
    player: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceRaised,
      overflow: 'hidden',
    },
    playerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
    },
    rank: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.lg,
      fontWeight: '800',
      width: 28,
      textAlign: 'center',
    },
    playerMain: { flex: 1, gap: 2 },
    playerName: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    chevron: { color: colors.inkMuted, fontSize: typography.scale.md },
    rows: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
    rowHead: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 5,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headText: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
    cellNum: { width: 26, color: colors.inkMuted, fontSize: typography.scale.sm },
    cellWord: { flex: 1, color: colors.ink, fontSize: typography.scale.sm },
    cellTyped: { flex: 1.2, fontSize: typography.scale.sm, fontWeight: '700' },
    cellTime: {
      width: 44,
      textAlign: 'right',
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
    },
  });
}
