import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeColors } from '@/state/themeStore';
import type { ThemeColors } from '@/constants/theme';

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

/**
 * The WordQuest brand mark, static. Same lockup as the splash's
 * AnimatedWordmark and the app icon: bold cream letters, every vowel in
 * glyph-gold with a rounded gold dash beneath it (the "blank" the vowel
 * fills in the Quest mechanic).
 *
 *  - `stacked`: WORD over QUEST, centred. Welcome / sign-in / register.
 *  - `inline`: WORDQUEST on one line, for nav bars and headers.
 *
 * `fontSize` is the size of one letter; the dashes scale with it.
 */
export interface WordmarkLogoProps {
  variant?: 'stacked' | 'inline';
  /** Stacked only: line up WORD / QUEST on the left edge instead of centring. */
  align?: 'center' | 'start';
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
  /** Hide from screen readers when a heading already names the screen. */
  decorative?: boolean;
}

function Letter({
  char,
  fontSize,
  colors,
}: {
  char: string;
  fontSize: number;
  colors: ThemeColors;
}) {
  const isVowel = VOWELS.has(char);
  return (
    <View style={styles.slot}>
      <Text
        style={[
          styles.letter,
          {
            fontSize,
            lineHeight: Math.round(fontSize * 1.12),
            letterSpacing: fontSize * 0.02,
            color: isVowel ? colors.glyph : colors.ink,
          },
        ]}
        allowFontScaling={false}
      >
        {char}
      </Text>
      {isVowel && (
        <View
          style={{
            backgroundColor: colors.glyph,
            width: fontSize * 0.55,
            height: Math.max(2, Math.round(fontSize * 0.09)),
            marginTop: Math.max(1, Math.round(fontSize * 0.06)),
            borderRadius: 999,
          }}
        />
      )}
    </View>
  );
}

function Word({ word, fontSize, colors }: { word: string; fontSize: number; colors: ThemeColors }) {
  return (
    <View style={styles.row}>
      {word.split('').map((ch, i) => (
        <Letter key={`${word}-${i}`} char={ch} fontSize={fontSize} colors={colors} />
      ))}
    </View>
  );
}

export function WordmarkLogo({
  variant = 'stacked',
  align = 'center',
  fontSize = 40,
  style,
  decorative = false,
}: WordmarkLogoProps) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        variant === 'stacked'
          ? { alignItems: align === 'start' ? ('flex-start' as const) : ('center' as const) }
          : styles.inline,
        style,
      ]}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : 'WordQuest'}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
    >
      <Word word="WORD" fontSize={fontSize} colors={colors} />
      <Word word="QUEST" fontSize={fontSize} colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'flex-start' },
  row: { flexDirection: 'row' },
  slot: { alignItems: 'center' },
  letter: { fontWeight: '800' },
});
