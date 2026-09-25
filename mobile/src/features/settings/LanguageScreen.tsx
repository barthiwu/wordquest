import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
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
 * Settings > Language. Eleven languages by design (see
 * constants/languages for why these eleven) -- a flat, full-screen list
 * rather than CountryPickerField's modal-with-search, since there's no
 * long list to search through here. Selecting a language updates
 * languageStore immediately (which also syncs it to the backend as
 * nativeLanguage, best-effort); there's no separate "Save" step,
 * matching the theme toggle's instant-apply pattern elsewhere in
 * Settings.
 *
 * As of the Sept 2026 UI-translation rollout, this genuinely IS a
 * UI-translation switch: WordQuest's own screens now follow whichever
 * language is picked here, alongside ALI's explanatory text. The words
 * WordQuest teaches still always stay in English -- that part of the
 * pedagogy hasn't changed. Every switch, including into/out of
 * Arabic/Farsi, applies instantly -- there's no restart prompt: the
 * app's layout intentionally never mirrors for RTL languages (see
 * src/i18n/rtlText.ts), so there's nothing native-side to catch up on.
 */
export function LanguageScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('settings');
  const selectedCode = useLanguageStore((s) => s.code);
  const setCode = useLanguageStore((s) => s.setCode);

  const onSelect = (code: string) => {
    setCode(code);
  };

  return (
    <View style={styles.container}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('language.title')}</Text>
      <Text style={styles.subtitle}>{t('language.subtitle')}</Text>

      <FlatList
        data={LANGUAGES}
        keyExtractor={(item) => item.code}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const selected = item.code === selectedCode;
          return (
            <Pressable
              style={[styles.row, selected && styles.rowSelected]}
              onPress={() => onSelect(item.code)}
              accessibilityRole="button"
              accessibilityLabel={t('language.rowLabel', {
                name: item.name,
                nativeName: item.nativeName,
              })}
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
