import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { LANGUAGES } from '@/constants/languages';
import { useLanguageStore } from '@/state/languageStore';
import { countryCodeToFlagEmoji } from '@/utils/countryFlag';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Language'>;

/**
 * Settings > Language. Ten languages by design (see constants/languages
 * for why these ten) — a flat, full-screen list rather than
 * CountryPickerField's modal-with-search, since there's no long list to
 * search through here. Selecting a language updates languageStore
 * immediately; there's no separate "Save" step, matching the theme
 * toggle's instant-apply pattern elsewhere in Settings.
 */
export function LanguageScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const selectedCode = useLanguageStore((s) => s.code);
  const setCode = useLanguageStore((s) => s.setCode);

  return (
    <View style={styles.container}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Language</Text>
      <Text style={styles.subtitle}>Choose the language WordQuest displays.</Text>

      <FlatList
        data={LANGUAGES}
        keyExtractor={(item) => item.code}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const selected = item.code === selectedCode;
          return (
            <Pressable
              style={[styles.row, selected && styles.rowSelected]}
              onPress={() => setCode(item.code)}
              accessibilityRole="button"
              accessibilityLabel={`${item.name} (${item.nativeName})`}
              accessibilityState={{ selected }}
            >
              <Text style={styles.flag}>{countryCodeToFlagEmoji(item.flagCountryCode)}</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowNative}>{item.nativeName}</Text>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={22} color={colors.arcaneSoft} />}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingTop: topInset + spacing.xxl,
      gap: spacing.xs,
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.sm, marginBottom: spacing.sm },
    list: { gap: spacing.xs, paddingBottom: spacing.xxl },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    rowSelected: { borderColor: colors.arcaneSoft, backgroundColor: colors.surfaceRaised },
    flag: { fontSize: 26 },
    rowText: { flex: 1, gap: 2 },
    rowName: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    rowNative: { color: colors.inkMuted, fontSize: typography.scale.sm },
  });
}
