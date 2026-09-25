import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography } from '@/constants/theme';

const STORAGE_KEY = 'wordquest.streakMilestoneAcknowledged.v1';

/**
 * The same thresholds achievement-catalog.ts's Consistency achievements
 * grant currentStreak at (backend `achievement/achievement-catalog.ts`,
 * "Consistency — currentStreak thresholds": 7/10/30/60/90) — mirrored
 * here display-only, same pattern as WordMasteryCard's MASTERY_THRESHOLD.
 * This ribbon never grants anything itself; it just celebrates, on the
 * device, a milestone the backend has already awarded, which is why
 * "Added to your Passport" is true the moment this shows (PassportView's
 * `achievements` list is what actually carries it).
 */
const STREAK_MILESTONES = [7, 10, 30, 60, 90];

interface Props {
  currentStreak: number;
}

/**
 * A dismissible celebration banner for a just-reached streak milestone —
 * added to Home in the Sept 2026 redesign (mockup B3's ribbon). Shown at
 * most once per milestone: dismissing it (or it simply not being open
 * again the same day) remembers the acknowledged value in AsyncStorage,
 * so it doesn't nag on every Home refocus for the rest of that streak
 * length.
 */
export function StreakMilestoneRibbon({ currentStreak }: Props) {
  const { t } = useTranslation('common');
  const [acknowledged, setAcknowledged] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        const parsed = raw ? Number(raw) : null;
        setAcknowledged(Number.isFinite(parsed) ? parsed : null);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isMilestone = STREAK_MILESTONES.includes(currentStreak);
  const visible = loaded && isMilestone && acknowledged !== currentStreak;

  if (!visible) return null;

  const dismiss = () => {
    setAcknowledged(currentStreak);
    AsyncStorage.setItem(STORAGE_KEY, String(currentStreak)).catch(() => {
      // Best-effort — worst case the ribbon reappears once more next visit.
    });
  };

  return (
    <LinearGradient
      colors={['#F4C542', '#FDE68A']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.ribbon}
    >
      <Ionicons name="ribbon" size={22} color="#181233" />
      <View style={styles.textCol}>
        <Text style={styles.title}>
          {t('streakMilestoneRibbon.title', { count: currentStreak })}
        </Text>
        <Text style={styles.subtitle}>{t('streakMilestoneRibbon.subtitle')}</Text>
      </View>
      <Pressable
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel={t('streakMilestoneRibbon.dismissHint')}
        hitSlop={8}
      >
        <Ionicons name="close" size={18} color="#181233" />
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  textCol: { flex: 1, gap: 1 },
  title: { color: '#181233', fontSize: typography.scale.sm, fontWeight: '700' },
  subtitle: { color: '#403313', fontSize: typography.scale.xs, fontWeight: '600' },
});
