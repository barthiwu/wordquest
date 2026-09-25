import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { BackButton } from '@/components/BackButton';

export interface LegalDocSection {
  heading: string;
  /** A paragraph, or a list of bullet lines. */
  body: string | string[];
}

interface Props {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: LegalDocSection[];
  onBack: () => void;
}

/**
 * Shared renderer for WordQuest's legal documents (Privacy Policy,
 * Terms of Service, Age Restriction) — same heading/paragraph/bullet
 * layout for all three, so they read as one consistent set rather than
 * three separately-styled screens. Content stays data-only (see
 * constants/privacyPolicy.ts, termsOfService.ts, ageRestriction.ts);
 * this component only knows how to lay it out.
 *
 * i18n note: `title` is passed in already translated by each calling
 * screen (see PrivacyPolicyScreen/TermsOfServiceScreen/
 * AgeRestrictionScreen) rather than hardcoded here, since this wrapper
 * doesn't know which document it's rendering. This component's own
 * chrome — the "Last updated:" label — is translated directly. The
 * document body itself (intro/sections) stays out of scope and is
 * rendered exactly as passed in.
 */
export function LegalDocScreen({ title, lastUpdated, intro, sections, onBack }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('legal');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={onBack} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.lastUpdated}>{t('lastUpdated', { date: lastUpdated })}</Text>
      <Text style={styles.paragraph}>{intro}</Text>

      {sections.map((section) => (
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
