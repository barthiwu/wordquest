import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import type { VersusGame } from '@/services/arcadeVersus';

const GAME_TITLE_KEY: Record<VersusGame, string> = {
  SCRAMBLE_QUEST: 'arcade:scrambleQuestTitle',
  COMPLETE_IT: 'arcade:completeItTitle',
  HANGMAN: 'arcade:hangmanTitle',
};

interface Props {
  /** The game the player tapped; null keeps the sheet closed. */
  game: VersusGame | null;
  onClose: () => void;
  onSingle: (game: VersusGame) => void;
  onRandom: (game: VersusGame) => void;
  onFriend: (game: VersusGame) => void;
}

interface OptionProps {
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  onPress: () => void;
}

function Option({ styles, colors, icon, title, sub, onPress }: OptionProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Ionicons name={icon} size={24} color={colors.arcaneSoft} />
      <View style={styles.optionText}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
    </Pressable>
  );
}

/**
 * The banner that slides up when a ScrambleQuest / Complete It / Hangman tile
 * is tapped: single player, or multiplayer (random opponent or a friend).
 * Word Duel never shows it -- it is multiplayer only.
 */
export function ArcadeModeSheet({ game, onClose, onSingle, onRandom, onFriend }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation(['arcade', 'common']);
  const [step, setStep] = useState<'mode' | 'multi'>('mode');

  useEffect(() => {
    if (game) setStep('mode');
  }, [game]);

  if (!game) return null;
  const gameName = t(GAME_TITLE_KEY[game]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common:close')}>
        <Pressable style={styles.sheet} onPress={() => {}} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <Text style={styles.title}>
            {step === 'mode'
              ? t('arcade:versus.modeTitle', { game: gameName })
              : t('arcade:versus.multi')}
          </Text>

          {step === 'mode' ? (
            <>
              <Option
                styles={styles}
                colors={colors}
                icon="person-outline"
                title={t('arcade:versus.single')}
                sub={t('arcade:versus.singleSub')}
                onPress={() => onSingle(game)}
              />
              <Option
                styles={styles}
                colors={colors}
                icon="people-outline"
                title={t('arcade:versus.multi')}
                sub={t('arcade:versus.multiSub')}
                onPress={() => setStep('multi')}
              />
            </>
          ) : (
            <>
              <Option
                styles={styles}
                colors={colors}
                icon="shuffle-outline"
                title={t('arcade:versus.random')}
                sub={t('arcade:versus.randomSub')}
                onPress={() => onRandom(game)}
              />
              <Option
                styles={styles}
                colors={colors}
                icon="person-add-outline"
                title={t('arcade:versus.friend')}
                sub={t('arcade:versus.friendSub')}
                onPress={() => onFriend(game)}
              />
              <Pressable
                style={styles.cancel}
                onPress={() => setStep('mode')}
                accessibilityRole="button"
                accessibilityLabel={t('arcade:versus.back')}
              >
                <Text style={styles.cancelText}>{t('arcade:versus.back')}</Text>
              </Pressable>
            </>
          )}

          {step === 'mode' && (
            <Pressable
              style={styles.cancel}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common:cancel')}
            >
              <Text style={styles.cancelText}>{t('common:cancel')}</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    sheet: {
      width: '100%',
      maxWidth: 520,
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
      gap: spacing.sm,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.border,
      marginBottom: spacing.sm,
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.lg,
      fontWeight: '800',
      textAlign: 'center',
      marginBottom: spacing.xs,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    optionPressed: { opacity: 0.8 },
    optionText: { flex: 1, gap: 2 },
    optionTitle: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    optionSub: { color: colors.inkMuted, fontSize: typography.scale.sm },
    cancel: { alignItems: 'center', paddingVertical: spacing.sm },
    cancelText: { color: colors.inkMuted, fontSize: typography.scale.md, fontWeight: '600' },
  });
}
