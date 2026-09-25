import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { fileReport, type ReportTargetType } from '@/services/reports';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';

const REASONS = [
  'Inappropriate name',
  'Harassment or bullying',
  'Inappropriate photo',
  'Spam',
  'Other',
] as const;

// Display-only translation keys for REASONS — the values submitted to
// fileReport() stay the original English strings (REASONS itself is
// unchanged) since that's the payload the moderation queue expects;
// only what's shown on screen is translated.
const REASON_KEYS: Record<(typeof REASONS)[number], string> = {
  'Inappropriate name': 'reportButton.reasons.inappropriateName',
  'Harassment or bullying': 'reportButton.reasons.harassmentOrBullying',
  'Inappropriate photo': 'reportButton.reasons.inappropriatePhoto',
  Spam: 'reportButton.reasons.spam',
  Other: 'reportButton.reasons.other',
};

interface Props {
  targetType: ReportTargetType;
  targetId: string;
  /** What's being reported, for the confirmation copy and accessibility label — e.g. a display name or clan name. */
  label: string;
}

/**
 * A small flag icon that opens a canned-reason picker and files a report
 * (POST /reports — reviewed by admin/support in the moderation queue,
 * ModerationController). Deliberately no free-text field: a short list of
 * reasons is faster to use on a phone and enough context for a reviewer
 * to triage against the target itself.
 */
export function ReportButton({ targetType, targetId, label }: Props) {
  const { t } = useTranslation('common');
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (reason: string) => {
    if (!accessToken || submitting) return;
    setSubmitting(true);
    try {
      await fileReport(accessToken, { targetType, targetId, reason });
      setOpen(false);
      Alert.alert(t('reportButton.sentTitle'), t('reportButton.sentMessage'));
    } catch (err) {
      Alert.alert(
        t('reportButton.errorTitle'),
        err instanceof ApiError ? err.message : t('reportButton.errorFallback'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('reportButton.reportLabel', { label })}
        style={styles.button}
      >
        <Ionicons name="flag-outline" size={16} color={colors.inkMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>{t('reportButton.title', { label })}</Text>
            <Text style={styles.subtitle}>{t('reportButton.subtitle')}</Text>
            {REASONS.map((reason) => (
              <Pressable
                key={reason}
                style={styles.reasonRow}
                disabled={submitting}
                onPress={() => submit(reason)}
                accessibilityRole="button"
                accessibilityLabel={t(REASON_KEYS[reason])}
              >
                <Text style={styles.reasonText}>{t(REASON_KEYS[reason])}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.cancelRow} onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>{t('cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: { padding: spacing.xs },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    sheet: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.md,
      fontWeight: '700',
    },
    subtitle: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      marginBottom: spacing.sm,
    },
    reasonRow: {
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    reasonText: {
      color: colors.ink,
      fontSize: typography.scale.md,
    },
    cancelRow: {
      paddingVertical: spacing.sm,
      marginTop: spacing.xs,
      alignItems: 'center',
    },
    cancelText: {
      color: colors.inkMuted,
      fontSize: typography.scale.md,
      fontWeight: '600',
    },
  });
}
