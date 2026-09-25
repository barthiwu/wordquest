import { Image, Text, type StyleProp, type TextStyle } from 'react-native';
import { useThemeColors } from '@/state/themeStore';
import { splitAliText } from '@/utils/richAliText';

interface RichAliTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  /**
   * Color for the XP/Glyph token text. Defaults to the theme's gold
   * currency accent (right for every dark-background call site this
   * renders on), but AliScreen's CTA banner is itself a gold gradient
   * (see ctaBar/ctaText) -- gold-on-gold token text would vanish there,
   * so that one call site passes its own dark ctaText color instead.
   */
  tokenColor?: string;
}

// Rasterized once from GlyphIcon.tsx's GlyphCoin component (fixed gold
// gradient, not theme-driven -- see that file) via sharp, so this is
// pixel-for-pixel the same coin QuestCompleteScreen/ShopScreen/
// DailyQuestScreen use. A flat PNG rather than inline <Svg> because
// <Image> is the child type React Native actually promises to lay out
// correctly inside <Text> on both platforms; an <Svg> (a native view,
// not a text glyph) isn't.
const glyphCoinIcon = require('../../assets/icons/glyph-coin.png');

/**
 * Renders one of ALI's reaction messages with the app's existing reward
 * tokens substituted for the literal words "Glyph"/"Glyphs" and "XP" --
 * the same Insight Glyph coin and the same gold treatment
 * DailyQuestScreen's XP pill uses -- instead of those words sitting as
 * plain prose the way no other reward mention in the app does. ALI's
 * copy comes back as free-form AI-generated prose (ali.service.ts), not
 * a template with reward slots a component could bind into, so this
 * pattern-matches the rendered string instead (see
 * utils/richAliText.ts for the actual tokenizing logic).
 *
 * Use in place of a plain <Text>{someAliText}</Text> anywhere ALI's
 * `.text` or `.recommendation` string is shown (AliScreen,
 * QuestCompleteScreen).
 */
export function RichAliText({ text, style, tokenColor }: RichAliTextProps) {
  const colors = useThemeColors();
  const resolvedTokenColor = tokenColor ?? colors.glyph;
  const segments = splitAliText(text);

  return (
    <Text style={style}>
      {segments.map((segment, i) => {
        if (segment.type === 'text') return segment.value;
        if (segment.type === 'xp') {
          return (
            <Text key={i} style={{ color: resolvedTokenColor, fontWeight: '800' }}>
              XP
            </Text>
          );
        }
        return (
          <Text key={i} style={{ color: resolvedTokenColor, fontWeight: '800' }}>
            <Image
              source={glyphCoinIcon}
              style={{ width: 13, height: 13, marginBottom: -2 }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />{' '}
            {segment.value}
          </Text>
        );
      })}
    </Text>
  );
}
