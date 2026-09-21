import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
      Alert.alert('Report sent', "Thanks — we'll take a look.");
    } catch (err) {
      Alert.alert('Could not send report', err instanceof ApiError ? err.message : 'Please try again.');
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
        accessibilityLabel={`Report ${label}`}
        style={styles.button}
      >
        <Ionicons name="flag-outline" size={16} color={colors.inkMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>Report {label}?</Text>
            <Text style={styles.subtitle}>Pick the reason that fits best.</Text>
            {REASONS.map((reason) => (
              <Pressable
                key={reason}
                style={styles.reasonRow}
                disabled={submitting}
                onPress={() => submit(reason)}
                accessibilityRole="button"
                accessibilityLabel={reason}
              >
                <Text style={styles.reasonText}>{reason}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.cancelRow} onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
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
