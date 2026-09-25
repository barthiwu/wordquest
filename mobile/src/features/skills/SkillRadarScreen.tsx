import { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { getMySkills, type SkillsView } from '@/services/skills';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import { RadarChart } from '@/components/RadarChart';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'SkillRadar'>;

/**
 * Screen 27 of the UI/UX Screen Bible — now a true polygon radar chart
 * (react-native-svg-based, see components/RadarChart.tsx) rather than the
 * horizontal-bar substitute this screen shipped with initially. An
 * unmeasured dimension still never gets a fabricated score: it plots at
 * the chart's center and is called out as "Not yet measured" in the
 * legend below (§32/§33: only multiple-choice exists today, so only
 * Vocabulary and Recall are real numbers).
 */
export function SkillRadarScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('skills');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [skills, setSkills] = useState<SkillsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    getMySkills(accessToken)
      .then(setSkills)
      .catch(() => setError(t('loadError')));
  }, [accessToken, t]);

  if (error) {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!skills) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('title')}</Text>
      <Text style={styles.subtitle}>{t('subtitle')}</Text>

      <RadarChart data={skills.dimensions} />

      <View style={styles.list}>
        {skills.dimensions.map((dim) => (
          <View key={dim.key} style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowLabel}>{dim.label}</Text>
              <Text style={styles.rowValue}>
                {dim.measured ? `${dim.score}` : t('notYetMeasured')}
              </Text>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${dim.measured ? dim.score : 0}%` },
                  !dim.measured && styles.fillUnmeasured,
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      paddingTop: topInset + spacing.xxl,
      gap: spacing.lg,
      alignItems: 'stretch',
    },
    centered: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    error: { color: colors.danger, fontSize: typography.scale.md },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.md },
    list: { gap: spacing.md },
    row: { gap: spacing.xs },
    rowHeader: { flexDirection: 'row', justifyContent: 'space-between' },
    rowLabel: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    rowValue: { color: colors.inkMuted, fontSize: typography.scale.sm },
    track: {
      height: 8,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    fill: { height: '100%', backgroundColor: colors.arcane, borderRadius: radius.pill },
    fillUnmeasured: { backgroundColor: 'transparent' },
  });
}
