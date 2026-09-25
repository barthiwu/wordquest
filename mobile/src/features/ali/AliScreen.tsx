import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { getMyAliMessages, type AliMessage } from '@/services/ali';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import { AliMark } from '@/components/AliMark';
import { AliMarkAnimated } from '@/components/AliMarkAnimated';
import { FadeInUp } from '@/components/FadeInUp';
import { RichAliText } from '@/components/RichAliText';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Ali'>;

const ROMAN: Array<[number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** Folio numbering for the feed (1-based position, oldest math untouched) — purely ordinal, not a content category. */
function toRoman(n: number): string {
  let remaining = n;
  let out = '';
  for (const [value, symbol] of ROMAN) {
    while (remaining >= value) {
      out += symbol;
      remaining -= value;
    }
  }
  return out || String(n);
}

/**
 * How far a folio has faded into "the past" — only the newest entry gets
 * the full wax-seal treatment; everything else quiets down the further
 * back it sits, capped so old entries stay legible rather than vanishing.
 */
function folioFade(index: number): number {
  return 1 - Math.min(index * 0.16, 0.42);
}

/**
 * Screen 44 of the UI/UX Screen Bible — "Basic ALI" from the MVP list.
 * ALI is reactive, not conversational (spec §4.1): this is a feed of
 * what ALI has already said in response to real events, not a chat the
 * player composes into. Empty state reads as "ALI's still getting to
 * know you" rather than an error, since a brand-new player genuinely
 * has no events yet.
 *
 * "The Wellspring" direction (Design canvas review, Sept 2026 — "none of
 * the first three wowed me, do something way better"): the identical
 * bordered-card feed is replaced with an animated hero (the same
 * AliMarkAnimated "ALI moment" mark QuestCompleteScreen uses, not a new
 * illustration) tearing into a continuous illuminated page — entries sit
 * directly on the background as numbered folios instead of repeated
 * card components, and only the newest entry gets the full raised
 * wax-seal medallion + gold callout; older ones quiet down structurally
 * (small mark, muted numeral, text-only link) as they recede. There's no
 * server-side "event type" to key an icon off, so folio numbers are
 * purely positional (I, II, III…), not a content category.
 *
 * i18n scope note: only this screen's own static chrome (hero subtitle,
 * empty state, loading/error text, "JUST NOW" caption) is translated
 * here. ALI's actual message text and recommendation text
 * (message.text / message.recommendation, rendered via RichAliText) are
 * ALI's curated dialogue coming from the ali service/message data, not
 * hardcoded literals in this screen — left untouched, same as
 * aliMagpieShapes.ts / ali.service.ts are out of scope. "ALI" itself is
 * a proper noun and is never wrapped in t() or translated.
 */
export function AliScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('ali');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [messages, setMessages] = useState<AliMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getMyAliMessages(accessToken)
      .then(setMessages)
      .catch(() => setError(t('loadError')));
  }, [accessToken, t]);

  useFocusEffect(load);

  if (error) {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!messages) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.hero}>
        <BackButton onPress={() => navigation.goBack()} />

        <View style={styles.heroMarkWrap}>
          <View style={styles.heroGlow} />
          <AliMarkAnimated size={84} />
        </View>
        {/* "ALI" is a proper noun -- never translated/renamed. */}
        <Text style={styles.heroTitle}>ALI</Text>
        <View style={styles.heroRule} />
        <Text style={styles.heroSubtitle}>{t('heroSubtitle')}</Text>

        <Svg
          width="100%"
          height={20}
          viewBox="0 0 390 20"
          preserveAspectRatio="none"
          style={styles.tornEdge}
        >
          <Path
            d="M0 20 L0 9 L14 15 L30 5 L47 14 L63 3 L80 13 L97 6 L114 16 L131 4 L148 12 L165 7 L182 17 L199 5 L216 14 L233 8 L250 18 L267 6 L284 13 L301 4 L318 15 L335 7 L352 16 L369 5 L390 12 L390 20 Z"
            fill={colors.background}
          />
        </Svg>
      </View>

      <View style={styles.folios}>
        {messages.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('emptyText')}</Text>
          </View>
        )}

        {messages.map((message, i) =>
          i === 0 ? (
            <FadeInUp key={i}>
              <NewestFolio message={message} colors={colors} styles={styles} t={t} />
            </FadeInUp>
          ) : (
            <View key={i}>
              <FolioDivider colors={colors} />
              <FadeInUp delay={Math.min(i, 4) * 90}>
                <OlderFolio index={i} message={message} colors={colors} styles={styles} />
              </FadeInUp>
            </View>
          ),
        )}
      </View>
    </ScrollView>
  );
}

function NewestFolio({
  message,
  colors,
  styles,
  t,
}: {
  message: AliMessage;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  t: TFunction;
}) {
  const ringPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(ringPulse, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      ringPulse.setValue(0);
    };
  }, [ringPulse]);

  const ringScale = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] });
  const ringOpacity = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View>
      <View style={styles.folioRow}>
        <View style={styles.folioTextCol}>
          <Text style={styles.folioKicker}>{toRoman(1)}</Text>
          {/* message.text is ALI's own curated reaction copy -- out of
              scope, left untranslated. */}
          <RichAliText style={styles.folioText} text={message.text} />
        </View>
        <View style={styles.sealCol}>
          <View style={styles.sealWrap}>
            <Animated.View
              style={[styles.sealRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
            />
            <LinearGradient
              colors={[colors.arcane, colors.arcaneSoft]}
              start={{ x: 0.15, y: 0.1 }}
              end={{ x: 0.9, y: 0.9 }}
              style={styles.seal}
            >
              <AliMark size={20} />
            </LinearGradient>
          </View>
          <Text style={styles.sealCaption}>{t('justNow')}</Text>
        </View>
      </View>

      {message.recommendation && (
        <LinearGradient
          colors={['#F4C542', '#FDE68A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ctaBar}
        >
          <Ionicons name="arrow-forward" size={14} color="#181233" />
          {/* message.recommendation is also ALI's own curated copy --
              out of scope, left untranslated. */}
          <RichAliText style={styles.ctaText} text={message.recommendation} tokenColor="#181233" />
        </LinearGradient>
      )}
    </View>
  );
}

function OlderFolio({
  index,
  message,
  colors,
  styles,
}: {
  index: number;
  message: AliMessage;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={{ opacity: folioFade(index) }}>
      <View style={styles.folioKickerRow}>
        <View style={styles.folioIconDot}>
          <AliMark size={11} />
        </View>
        <Text style={styles.folioKickerMuted}>{toRoman(index + 1)}</Text>
      </View>
      <RichAliText style={styles.folioTextMuted} text={message.text} />
      {message.recommendation && (
        <View style={styles.folioLinkRow}>
          <Ionicons name="arrow-forward" size={12} color={colors.arcaneSoft} />
          <RichAliText style={styles.folioLinkText} text={message.recommendation} />
        </View>
      )}
    </View>
  );
}

function FolioDivider({ colors }: { colors: ThemeColors }) {
  return (
    <View style={dividerStyles.row}>
      <View style={[dividerStyles.line, { backgroundColor: colors.border }]} />
      <Ionicons name="sparkles" size={11} color={colors.arcaneSoft} style={dividerStyles.icon} />
      <View style={[dividerStyles.line, { backgroundColor: colors.border }]} />
    </View>
  );
}

const dividerStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.lg },
  line: { flex: 1, height: 1 },
  icon: { opacity: 0.7 },
});

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingBottom: spacing.xxl },
    centered: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    error: { color: colors.danger, fontSize: typography.scale.md },

    // Hero
    hero: {
      position: 'relative',
      alignItems: 'center',
      paddingTop: topInset + spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
      backgroundColor: colors.surfaceRaised,
      overflow: 'hidden',
    },
    heroMarkWrap: {
      marginTop: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroGlow: {
      position: 'absolute',
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: colors.arcane,
      opacity: 0.22,
    },
    heroTitle: {
      color: colors.ink,
      fontSize: 30,
      fontWeight: typography.display.weight,
      letterSpacing: 2,
      marginTop: spacing.sm,
    },
    heroRule: {
      width: 72,
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.glyph,
      marginTop: spacing.sm,
    },
    heroSubtitle: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      fontStyle: 'italic',
      textAlign: 'center',
      marginTop: spacing.sm,
      maxWidth: 280,
    },
    tornEdge: { position: 'absolute', left: 0, right: 0, bottom: -1 },

    // Folios
    folios: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
    empty: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    emptyText: { color: colors.inkMuted, fontSize: typography.scale.sm },

    folioRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    folioTextCol: { flex: 1 },
    folioKicker: {
      color: colors.glyph,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      letterSpacing: 1.5,
      marginBottom: spacing.sm,
    },
    folioText: { color: colors.ink, fontSize: typography.scale.md, lineHeight: 24 },

    sealCol: { alignItems: 'center', gap: spacing.xs, width: 60 },
    sealWrap: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
    sealRing: {
      position: 'absolute',
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 2,
      borderColor: colors.glyph,
    },
    seal: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 2,
      borderColor: colors.glyph,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sealCaption: {
      color: colors.glyph,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.8,
    },

    ctaBar: {
      marginTop: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    ctaText: { color: '#181233', fontSize: typography.scale.sm, fontWeight: '700', flexShrink: 1 },

    folioKickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    folioIconDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    folioKickerMuted: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      letterSpacing: 1.5,
    },
    folioTextMuted: { color: colors.inkMuted, fontSize: typography.scale.sm, lineHeight: 22 },
    folioLinkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    folioLinkText: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      flexShrink: 1,
    },
  });
}
