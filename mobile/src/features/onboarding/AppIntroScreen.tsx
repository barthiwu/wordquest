import { useRef, useState, useMemo } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'AppIntro'>;

const SLIDE_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'checkmark-done-circle-outline',
  'game-controller-outline',
  'trending-up-outline',
];

const SLIDE_KEYS = ['quests', 'arcade', 'progress'] as const;

/**
 * A short, skippable "what is this app" orientation, shown exactly once
 * -- the last stop in the brand-new-account chain (Registration >
 * Biodata > OnboardingGoal > ClanSelection > here > Main), never shown
 * again since Login/Splash's stored-session path both go straight to
 * Main (see those screens' own navigation.replace('Main') calls). Not
 * numbered against the UI/UX Screen Bible -- this was added after that
 * spec, following Barth's Sept 2026 "does the app need a mechanics
 * explainer pop-up" question.
 *
 * Deliberately altitude-limited: three slides, one line each, at the
 * "what will I find here" level -- never "how is CEFR calculated" or
 * "how does mastery work," which read as noise before a player has
 * touched the app once. That detail lives in FirstTimeTip callouts
 * inside PlayScreen and PassportScreen instead, shown contextually the
 * first time a player actually looks at the thing being explained.
 */
export function AppIntroScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get('window');
  const styles = useMemo(
    () => createStyles(colors, insets.top, insets.bottom, width),
    [colors, insets.top, insets.bottom, width],
  );
  const { t } = useTranslation('onboarding');
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const lastSlide = index === SLIDE_KEYS.length - 1;

  const finish = () => navigation.replace('Main');

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(Math.max(0, Math.min(SLIDE_KEYS.length - 1, next)));
  };

  const goNext = () => {
    if (lastSlide) {
      finish();
      return;
    }
    scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
    setIndex(index + 1);
  };

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.skip}
        onPress={finish}
        accessibilityRole="button"
        accessibilityLabel={t('intro.skip')}
      >
        <Text style={styles.skipText}>{t('intro.skip')}</Text>
      </Pressable>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={16}
      >
        {SLIDE_KEYS.map((key, i) => (
          <View key={key} style={[styles.slide, { width }]}>
            <View style={styles.iconBadge}>
              <Ionicons name={SLIDE_ICONS[i]} size={44} color={colors.glyph} />
            </View>
            <Text style={styles.slideTitle}>{t(`intro.${key}Title`)}</Text>
            <Text style={styles.slideBody}>{t(`intro.${key}Body`)}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDE_KEYS.map((key, i) => (
            <View key={key} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Pressable
          style={styles.nextButton}
          onPress={goNext}
          accessibilityRole="button"
          accessibilityLabel={lastSlide ? t('intro.getStarted') : t('intro.next')}
        >
          <Text style={styles.nextButtonText}>
            {lastSlide ? t('intro.getStarted') : t('intro.next')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number, bottomInset: number, width: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    skip: {
      position: 'absolute',
      top: topInset + spacing.md,
      right: spacing.lg,
      zIndex: 1,
      padding: spacing.xs,
    },
    skipText: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      fontWeight: '600',
    },
    slide: {
      width,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: topInset + spacing.xxl,
      paddingHorizontal: spacing.xl,
      gap: spacing.md,
    },
    iconBadge: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    slideTitle: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
      textAlign: 'center',
    },
    slideBody: {
      color: colors.inkMuted,
      fontSize: typography.scale.md,
      textAlign: 'center',
      maxWidth: 320,
    },
    footer: {
      paddingHorizontal: spacing.xl,
      paddingBottom: bottomInset + spacing.xl,
      paddingTop: spacing.md,
      gap: spacing.lg,
      alignItems: 'center',
    },
    dots: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    dotActive: {
      backgroundColor: colors.arcane,
      width: 20,
    },
    nextButton: {
      width: '100%',
      backgroundColor: colors.arcane,
      borderRadius: radius.pill,
      paddingVertical: spacing.md + 2,
      alignItems: 'center',
    },
    nextButtonText: {
      color: colors.ink,
      fontSize: typography.scale.md,
      fontWeight: '700',
    },
  });
}
