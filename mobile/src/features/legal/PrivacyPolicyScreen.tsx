import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { BackButton } from '@/components/BackButton';
import {
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
} from '@/constants/privacyPolicy';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'PrivacyPolicy'>;

/**
 * Reachable from Settings and from the Registration screen's "By
 * creating an account..." line. Content lives in
 * constants/privacyPolicy.ts, kept by hand in sync with the canonical
 * docs/PRIVACY_POLICY.md at the repo root (age gate / moderation /
 * analytics build, Sept 2026).
 */
export function PrivacyPolicyScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Privacy Policy</Text>
      <Text style={styles.lastUpdated}>Last updated: {PRIVACY_POLICY_LAST_UPDATED}</Text>
      <Text style={styles.paragraph}>{PRIVACY_POLICY_INTRO}</Text>

      {PRIVACY_POLICY_SECTIONS.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.heading}>{section.heading}</Text>
          {Array.isArray(section.body) ? (
            section.body.map((line) => (
              <View key={line} style={styles.bulletRow}>
                <Text style={styles.bullet}>{'•'}</Text>
                <Text style={styles.bulletText}>{line}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.paragraph}>{section.body}</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xxl,
      paddingTop: topInset + spacing.xxl,
      gap: spacing.md,
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    lastUpdated: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      marginTop: -spacing.sm,
    },
    section: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    heading: {
      color: colors.ink,
      fontSize: typography.scale.md,
      fontWeight: '700',
    },
    paragraph: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      lineHeight: typography.scale.sm * 1.5,
    },
    bulletRow: { flexDirection: 'row', gap: spacing.xs },
    bullet: { color: colors.inkMuted, fontSize: typography.scale.sm },
    bulletText: {
      flex: 1,
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      lineHeight: typography.scale.sm * 1.5,
    },
  });
}
