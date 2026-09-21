import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { COUNTRIES, type Country } from '@/constants/countries';
import { countryCodeToFlagEmoji } from '@/utils/countryFlag';

interface Props {
  value: string | null;
  onChange: (code: string) => void;
  label?: string;
}

/**
 * Country picker used at onboarding (and anywhere else a player's country
 * is chosen): a tappable field showing the selected flag + name, backed by
 * a searchable full-screen list of every country in constants/countries.ts.
 * Replaces the old free-text 2-letter code entry per the flags-not-codes
 * request -- selection still resolves to the same ISO alpha-2 `code` the
 * rest of the app (updateMe, Passport, Journey) already expects.
 */
export function CountryPickerField({ value, onChange, label = 'Country' }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(() => COUNTRIES.find((c) => c.code === value) ?? null, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [query]);

  const select = (country: Country) => {
    onChange(country.code);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <Pressable
        style={styles.field}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={selected ? `${label}: ${selected.name}` : `Select ${label.toLowerCase()}`}
      >
        {selected ? (
          <View style={styles.fieldSelected}>
            <Text style={styles.flag}>{countryCodeToFlagEmoji(selected.code)}</Text>
            <Text style={styles.fieldText}>{selected.name}</Text>
          </View>
        ) : (
          <Text style={styles.placeholder}>Select your country</Text>
        )}
        <Ionicons name="chevron-down" size={18} color={colors.inkMuted} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select your country</Text>
            <Pressable
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
            >
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
          </View>

          <TextInput
            style={styles.search}
            placeholder="Search countries"
            placeholderTextColor={colors.inkMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="words"
            accessibilityLabel="Search countries"
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
                <Text style={styles.flag}>{countryCodeToFlagEmoji(item.code)}</Text>
                <Text style={styles.rowText}>{item.name}</Text>
                {item.code === value && (
                  <Ionicons name="checkmark" size={18} color={colors.arcaneSoft} />
                )}
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No countries match &ldquo;{query}&rdquo;.</Text>
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
    rowText: { flex: 1, color: colors.ink, fontSize: typography.scale.md },
    emptyText: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      textAlign: 'center',
      marginTop: spacing.xl,
    },
  });
}
