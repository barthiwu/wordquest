import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { submitFeedback, type FeedbackCategory } from '@/services/feedback';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'SendFeedback'>;

/** Same eight categories the backend's FeedbackCategory enum defines
 * (Telemetry spec §17) — order here is what actually drives the layout,
 * the enum values just need to match exactly. */
const CATEGORIES: FeedbackCategory[] = [
  'GAMEPLAY',
  'DIFFICULTY',
  'WORD_DUEL',
  'ARCADE',
  'ALI',
  'BUG',
  'UI',
  'OTHER',
];

/**
 * Settings -> Send Feedback (Telemetry spec §20) — the standalone,
 * player-initiated counterpart to the targeted lightweight prompts
 * (spec §18, shown contextually after a session). Always submits as
 * type: 'FREEFORM': no cooldown, no rating scale, just a category and
 * free text, since a player who navigated here on their own already
 * has a specific report in mind rather than reacting to a just-played
 * session.
 */
export function SendFeedbackScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('feedback');
  const accessToken = useAuthStore((s) => s.accessToken);

  const [category, setCategory] = useState<FeedbackCategory>('GAMEPLAY');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = message.trim().length > 0 && !submitting;

  const onSubmit = async () => {
    if (!accessToken || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFeedback(accessToken, {
        type: 'FREEFORM',
        category,
        message: message.trim(),
      });
      setSent(true);
    } catch {
      setError(t('errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.container}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.doneWrap}>
          <Text style={styles.title}>{t('sentTitle')}</Text>
          <Text style={styles.subtitle}>{t('sentSubtitle')}</Text>
          <Pressable
            style={styles.button}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('done')}
          >
            <Text style={styles.buttonText}>{t('done')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <BackButton onPress={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('title')}</Text>
        <Text style={styles.subtitle}>{t('subtitle')}</Text>

        <Text style={styles.sectionLabel}>{t('categoryLabel')}</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat}
              style={[styles.chip, category === cat && styles.chipSelected]}
              onPress={() => setCategory(cat)}
              accessibilityRole="button"
              accessibilityState={{ selected: category === cat }}
              accessibilityLabel={t(`category.${cat}`)}
            >
              <Text style={[styles.chipText, category === cat && styles.chipTextSelected]}>
                {t(`category.${cat}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>{t('messageLabel')}</Text>
        <TextInput
          style={styles.textArea}
          placeholder={t('messagePlaceholder')}
          placeholderTextColor={colors.inkMuted}
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={6}
          maxLength={2000}
          textAlignVertical="top"
          accessibilityLabel={t('messageLabel')}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={t('send')}
        >
          {submitting ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Text style={styles.buttonText}>{t('send')}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: topInset + spacing.md,
    },
    content: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    doneWrap: {
      flex: 1,
      paddingHorizontal: spacing.xl,
      justifyContent: 'center',
      gap: spacing.md,
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.md },
    sectionLabel: {
      color: colors.ink,
      fontSize: typography.scale.sm,
      fontWeight: '700',
      marginTop: spacing.sm,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipSelected: { backgroundColor: colors.arcane, borderColor: colors.arcane },
    chipText: { color: colors.inkMuted, fontSize: typography.scale.sm },
    chipTextSelected: { color: colors.ink, fontWeight: '700' },
    textArea: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      color: colors.ink,
      fontSize: typography.scale.md,
      minHeight: 140,
    },
    error: { color: colors.danger, fontSize: typography.scale.sm },
    button: {
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
  });
}
