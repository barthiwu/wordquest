import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import type { TodayQuestSummary } from '@/services/quests';

interface Props {
  colors: ThemeColors;
  /** null while still loading — rings render at 0 rather than blocking the rest of the card. */
  todaySummary: TodayQuestSummary | null;
  currentStreak: number;
}

/**
 * Home's Daily Goals card (mockup B1 Refined). Two rings, not the
 * mockup's original three: Words uses the real GET /quests/today count
 * out of the real 3 quest windows (backend/prisma/seed.ts's
 * morning/noon/evening quests), and Streak reflects the player's real
 * currentStreak/whether today's activity is already in. The mockup's
 * third ring, "Earn 50 XP", was dropped on implementation — no daily XP
 * target exists anywhere in gameplay-rules.ts or any other spec, so
 * shipping one would have invented a game rule that was never approved,
 * not just changed the UI around a real one.
 *
 * The streak ring carries its own flame + count in the center (the same
 * "flame" mark HomeScreen's header pill uses), dimmed to inkMuted on a
 * day nothing's been played yet and lit to warning/glowing once it has
 * -- so the ring itself reads as "is today's streak safe," matching the
 * header pill's flame which gets the same dim/lit treatment for the
 * same reason.
 */
export function DailyGoalsCard({ colors, todaySummary, currentStreak }: Props) {
  const { t } = useTranslation('common');
  const styles = useMemo(() => createStyles(colors), [colors]);
  const resetsIn = useCountdownToLocalMidnight();

  const completed = todaySummary?.completedCount ?? 0;
  const total = todaySummary?.totalCount ?? 3;
  const doneForToday = completed > 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('dailyGoalsCard.title')}</Text>
        <View style={styles.countdownPill}>
          <Text style={styles.countdownText}>
            {t('dailyGoalsCard.resetsIn', { time: resetsIn })}
          </Text>
        </View>
      </View>

      <View style={styles.ringsRow}>
        <Ring
          progress={total > 0 ? completed / total : 0}
          color={colors.arcaneSoft}
          trackColor={colors.surfaceRaised}
          labelColor={colors.ink}
          label={t('dailyGoalsCard.learnWords', { count: total })}
          value={`${completed} / ${total}`}
        />
        <Ring
          progress={doneForToday ? 1 : 0}
          color={colors.success}
          trackColor={colors.surfaceRaised}
          glow={doneForToday}
          labelColor={colors.ink}
          label={t('dailyGoalsCard.keepStreak')}
          value={doneForToday ? t('dailyGoalsCard.doneForToday') : t('dailyGoalsCard.playToday')}
          center={
            <View style={ringStyles.streakCenter}>
              <Ionicons
                name="flame"
                size={18}
                color={doneForToday ? colors.warning : colors.inkMuted}
              />
              <Text
                style={[
                  ringStyles.streakCenterValue,
                  { color: doneForToday ? colors.warning : colors.inkMuted },
                ]}
              >
                {currentStreak}
              </Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const RING_SIZE = 76;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function Ring({
  progress,
  color,
  trackColor,
  label,
  labelColor,
  value,
  glow,
  center,
}: {
  progress: number;
  color: string;
  trackColor: string;
  label: string;
  /** Text color for the caption below the ring -- theme-aware (colors.ink), since ringStyles.label itself can't be, being a static StyleSheet declared outside the themed component. Previously unset, which meant React Native's plain default (black) on the dark theme's near-black card -- barely legible. */
  labelColor: string;
  value: string;
  glow?: boolean;
  /** Optional content overlaid in the ring's empty middle (e.g. the streak flame + count). */
  center?: React.ReactNode;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = RING_CIRCUMFERENCE * (1 - clamped);

  return (
    <View style={ringStyles.col}>
      <View
        style={[
          ringStyles.svgWrap,
          glow && {
            shadowColor: color,
            shadowOpacity: 0.6,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 0 },
          },
        ]}
      >
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={trackColor}
            strokeWidth={RING_STROKE}
            fill="none"
          />
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={color}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={offset}
            fill="none"
            rotation={-90}
            origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
          />
        </Svg>
        {center && <View style={ringStyles.centerOverlay}>{center}</View>}
      </View>
      <Text style={[ringStyles.value, { color }]}>{value}</Text>
      <Text style={[ringStyles.label, { color: labelColor }]}>{label}</Text>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  col: { flex: 1, alignItems: 'center', gap: 4 },
  value: { fontSize: typography.scale.sm, fontWeight: '700', marginTop: spacing.xs },
  label: { fontSize: typography.scale.xs, textAlign: 'center' },
  svgWrap: { width: RING_SIZE, height: RING_SIZE },
  centerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakCenter: { alignItems: 'center' },
  streakCenterValue: { fontSize: typography.scale.md, fontWeight: '800', marginTop: 1 },
});

/** Live "Xh Ym" until the player's own local midnight — the real Daily Quest reset boundary (their localDate rolls over then; see backend PlayerClockService). Ticks once a minute. */
function useCountdownToLocalMidnight(): string {
  const compute = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const ms = Math.max(0, midnight.getTime() - now.getTime());
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    return `${hours}h ${minutes}m`;
  };

  const [label, setLabel] = useState(compute);

  useEffect(() => {
    const id = setInterval(() => setLabel(compute()), 60_000);
    return () => clearInterval(id);
  }, []);

  return label;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.md,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    countdownPill: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    countdownText: { color: colors.inkMuted, fontSize: typography.scale.xs, fontWeight: '600' },
    ringsRow: { flexDirection: 'row' },
  });
}
