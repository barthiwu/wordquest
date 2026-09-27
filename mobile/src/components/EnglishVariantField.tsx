import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';

interface Props {
  value: 'US' | 'UK';
  onChange: (variant: 'US' | 'UK') => void;
}

/**
 * US/UK English spelling-variant choice (2026-09 fairness feature — see
 * backend/src/vocabulary/english-variant.ts). Deliberately NOT built on
 * LanguagePickerField's tappable-field + full-screen-search-modal
 * pattern: this is a binary choice that always has a default (UK), never
 * needs searching, and is self-explanatory once you see the two actual
 * spellings side by side — a modal would be ceremony for two options.
 *
 * Two side-by-side cards, always both visible, one always selected.
 * Each card shows the flag, the variant name, and the concrete spelling
 * difference itself ("color" vs "colour") so the choice needs no extra
 * copy to understand.
 */
export function EnglishVariantField({ value, onChange }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation('onboarding');

  const options: Array<{ key: 'US' | 'UK'; flag: string; label: string; example: string }> = [
    {
      key: 'US',
      flag: '🇺🇸',
      label: t('biodata.englishVariantUsLabel'),
      example: t('biodata.englishVariantUsExample'),
    },
    {
      key: 'UK',
      flag: '🇬🇧',
      label: t('biodata.englishVariantUkLabel'),
      example: t('biodata.englishVariantUkExample'),
    },
  ];

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = value === option.key;
        return (
          <Pressable
            key={option.key}
            style={[styles.card, selected && styles.cardSelected]}
            onPress={() => onChange(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label}: ${option.example}`}
          >
            {selected && (
              <View style={styles.checkBadge}>
                <Ionicons name="checkmark-circle" size={18} color={colors.arcane} />
              </View>
            )}
            <Text style={styles.flag}>{option.flag}</Text>
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
            <Text style={[styles.example, selected && styles.exampleSelected]}>
              {option.example}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', gap: spacing.sm },
    card: {
      flex: 1,
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
    },
    cardSelected: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.arcane,
      borderWidth: 2,
    },
    checkBadge: { position: 'absolute', top: spacing.xs, right: spacing.xs },
    flag: { fontSize: 28 },
    label: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    labelSelected: { color: colors.ink },
    example: { color: colors.inkMuted, fontSize: typography.scale.xs, fontStyle: 'italic' },
    exampleSelected: { color: colors.arcaneSoft },
  });
}
