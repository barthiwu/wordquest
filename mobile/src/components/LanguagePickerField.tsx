import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { LANGUAGES, type Language } from '@/constants/languages';
import { countryCodeToFlagEmoji } from '@/utils/countryFlag';

interface Props {
  value: string | null;
  onChange: (code: string) => void;
  label?: string;
}

/**
 * Language picker for the language ALI explains and guides in
 * (nativeLanguage — see Settings' LanguageScreen; WordQuest always
 * teaches English, so this is never a vocabulary/target-language
 * switch). A direct mirror of CountryPickerField's tappable-field +
 * searchable full-screen list pattern, over LANGUAGES instead of
 * COUNTRIES.
 */
export function LanguagePickerField({ value, onChange, label }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('common');
  const resolvedLabel = label ?? t('fields.language');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(() => LANGUAGES.find((l) => l.code === value) ?? null, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LANGUAGES;
    return LANGUAGES.filter(
      (l) => l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q),
    );
  }, [query]);

  const select = (language: Language) => {
    onChange(language.code);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <Pressable
        style={styles.field}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={
          selected ? `${resolvedLabel}: ${selected.name}` : `${t('pickers.language.placeholder')}`
        }
      >
        {selected ? (
          <View style={styles.fieldSelected}>
            <Text style={styles.flag}>{countryCodeToFlagEmoji(selected.flagCountryCode)}</Text>
            <Text style={styles.fieldText}>{selected.name}</Text>
          </View>
        ) : (
          <Text style={styles.placeholder}>{t('pickers.language.placeholder')}</Text>
        )}
        <Ionicons name="chevron-down" size={18} color={colors.inkMuted} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('pickers.language.modalTitle')}</Text>
            <Pressable
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel={t('close')}
              hitSlop={8}
            >
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
          </View>

          <TextInput
            style={styles.search}
            placeholder={t('pickers.language.searchPlaceholder')}
            placeholderTextColor={colors.inkMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="words"
            accessibilityLabel={t('pickers.language.searchLabel')}
          />

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={[styles.row, item.code === value && styles.rowSelected]}
                onPress={() => select(item)}
                accessibilityRole="button"
                accessibilityLabel={item.name}
              >
                <Text style={styles.flag}>{countryCodeToFlagEmoji(item.flagCountryCode)}</Text>
                <Text style={styles.rowText}>{item.name}</Text>
                <Text style={styles.rowNativeText}>{item.nativeName}</Text>
                {item.code === value && (
                  <Ionicons name="checkmark" size={18} color={colors.arcaneSoft} />
                )}
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>{t('pickers.language.noMatches', { query })}</Text>
            }
            contentContainerStyle={styles.list}
          />
        </View>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    fieldSelected: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    fieldText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '600' },
    placeholder: { color: colors.inkMuted, fontSize: typography.scale.md },
    flag: { fontSize: 22 },
    modal: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: topInset + spacing.xl,
      paddingHorizontal: spacing.xl,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    modalTitle: {
      color: colors.ink,
      fontSize: typography.scale.lg,
      fontWeight: typography.display.weight,
    },
    search: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.ink,
      fontSize: typography.scale.md,
      marginBottom: spacing.md,
    },
    list: { gap: spacing.xs, paddingBottom: spacing.xxl },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
    },
    rowSelected: { backgroundColor: colors.surfaceRaised },
    rowText: { color: colors.ink, fontSize: typography.scale.md },
    rowNativeText: { flex: 1, color: colors.inkMuted, fontSize: typography.scale.sm },
    emptyText: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      textAlign: 'center',
      marginTop: spacing.xl,
    },
  });
}
