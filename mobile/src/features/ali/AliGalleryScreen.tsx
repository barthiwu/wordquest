import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';
import { BackButton } from '@/components/BackButton';
import { AliCharacter } from '@/components/AliCharacter';
import { AliSequencePlayer } from '@/components/AliSequencePlayer';
import { EXPRESSIONS, POSES } from '@/components/aliRig';
import { ALI_SEQUENCE_IDS, type AliSequenceId } from '@/components/aliSequences';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import type { AliExpression, AliIntensity, AliPose } from '@/services/aliExpression';
import { useThemeColors } from '@/state/themeStore';

type Props = NativeStackScreenProps<RootStackParamList, 'AliGallery'>;

const EXPRESSION_IDS = Object.keys(EXPRESSIONS) as AliExpression[];
const POSE_IDS = Object.keys(POSES) as AliPose[];
const INTENSITIES: AliIntensity[] = [0, 1, 2, 3, 4, 5];

const pretty = (id: string) =>
  id
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/**
 * ALI's moves — a review stage for the whole ALI Character & Animation
 * Bible vocabulary: tap any of the 12 expressions, 16 poses and 6 intensity
 * tiers, or play one of the six major sequences, and ALI performs it. The
 * same single rig the real reactions use; nothing here is special artwork.
 * Expression/pose/sequence names are the Bible's own ids (never translated).
 */
export function AliGalleryScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useTranslation('ali');
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);

  const [expression, setExpression] = useState<AliExpression>('CURIOUS');
  const [pose, setPose] = useState<AliPose>('PERCHED');
  const [intensity, setIntensity] = useState<AliIntensity>(3);
  const [sequence, setSequence] = useState<AliSequenceId | null>(null);
  const [motion, setMotion] = useState(true);
  const [replay, setReplay] = useState(0);

  const stage = Math.min(width - spacing.lg * 2, 460);
  const aliSize = Math.round(stage * 0.92);

  const chip = (label: string, active: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );

  const pick = <T,>(set: (v: T) => void, v: T) => {
    setSequence(null);
    set(v);
    setReplay((n) => n + 1);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('gallery.title', { defaultValue: 'ALI’s moves' })}</Text>
      <Text style={styles.subtitle}>
        {t('gallery.subtitle', {
          defaultValue: 'Tap an expression, a pose or a major moment to watch ALI perform it.',
        })}
      </Text>

      <View style={[styles.stage, { width: stage }]}>
        {sequence ? (
          <AliSequencePlayer key={`${sequence}-${replay}`} sequence={sequence} size={aliSize} />
        ) : (
          <AliCharacter
            key={`${expression}-${pose}-${intensity}-${replay}-${motion ? 1 : 0}`}
            size={aliSize}
            expression={expression}
            pose={pose}
            intensity={intensity}
            animated={motion}
          />
        )}
        <Text style={styles.caption}>
          {sequence ? pretty(sequence) : `${pretty(expression)} · ${pretty(pose)} · ${intensity}`}
        </Text>
      </View>

      <View style={styles.row}>
        <Pressable
          style={styles.replay}
          accessibilityRole="button"
          onPress={() => setReplay((n) => n + 1)}
        >
          <Text style={styles.replayText}>{t('gallery.replay', { defaultValue: 'Replay' })}</Text>
        </Pressable>
        <View style={styles.switchRow}>
          <Text style={styles.label}>{t('gallery.motion', { defaultValue: 'Motion' })}</Text>
          <Switch value={motion} onValueChange={setMotion} />
        </View>
      </View>

      <Text style={styles.section}>
        {t('gallery.sequences', { defaultValue: 'Major moments' })}
      </Text>
      <View style={styles.chips}>
        {ALI_SEQUENCE_IDS.map((id) =>
          chip(
            pretty(id),
            sequence === id,
            () => {
              setSequence(id);
              setReplay((n) => n + 1);
            },
            id,
          ),
        )}
      </View>

      <Text style={styles.section}>
        {t('gallery.expressions', { defaultValue: 'Expressions' })}
      </Text>
      <View style={styles.chips}>
        {EXPRESSION_IDS.map((id) =>
          chip(pretty(id), !sequence && expression === id, () => pick(setExpression, id), id),
        )}
      </View>

      <Text style={styles.section}>{t('gallery.poses', { defaultValue: 'Poses' })}</Text>
      <View style={styles.chips}>
        {POSE_IDS.map((id) =>
          chip(pretty(id), !sequence && pose === id, () => pick(setPose, id), id),
        )}
      </View>

      <Text style={styles.section}>{t('gallery.intensity', { defaultValue: 'Intensity' })}</Text>
      <View style={styles.chips}>
        {INTENSITIES.map((i) =>
          chip(String(i), !sequence && intensity === i, () => pick(setIntensity, i), `i${i}`),
        )}
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      padding: spacing.lg,
      paddingTop: topInset + spacing.sm,
      paddingBottom: spacing.xxl,
      gap: spacing.sm,
    },
    title: {
      color: colors.ink,
      fontSize: 26,
      fontWeight: typography.display.weight,
      marginTop: spacing.sm,
    },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.sm, marginBottom: spacing.sm },
    stage: {
      alignSelf: 'center',
      alignItems: 'center',
      backgroundColor: '#1b2a5a',
      borderRadius: radius.lg,
      paddingVertical: spacing.md,
      overflow: 'hidden',
    },
    caption: {
      color: '#fff',
      fontSize: typography.scale.sm,
      fontWeight: '700',
      marginTop: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
    },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    label: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '600' },
    replay: {
      backgroundColor: colors.arcane,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
    },
    replayText: { color: '#fff', fontWeight: '700' },
    section: {
      color: colors.ink,
      fontSize: typography.scale.md,
      fontWeight: '700',
      marginTop: spacing.md,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.arcane, borderColor: colors.arcane },
    chipText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '600' },
    chipTextActive: { color: '#fff' },
  });
}
