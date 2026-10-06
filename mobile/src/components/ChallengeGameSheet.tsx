import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import type { ChallengeGame } from '@/services/arcadeVersus';
import { CompleteItIcon, HangmanIcon, ScrambleQuestIcon, WordDuelIcon } from './ArcadeGameIcons';

interface Props {
  /** The friend being challenged; null keeps the sheet closed. */
  friendName: string | null;
  onClose: () => void;
  onPick: (game: ChallengeGame) => void;
}

const GAMES: {
  game: ChallengeGame;
  titleKey: string;
  subKey: string;
  Icon: typeof ScrambleQuestIcon;
}[] = [
  {
    game: 'SCRAMBLE_QUEST',
    titleKey: 'arcade:scrambleQuestTitle',
    subKey: 'arcade:scrambleQuestSubtitle',
    Icon: ScrambleQuestIcon,
  },
  {
    game: 'WORD_DUEL',
    titleKey: 'arcade:wordDuelTitle',
    subKey: 'friends:challenge.duelNote',
    Icon: WordDuelIcon,
  },
  {
    game: 'COMPLETE_IT',
    titleKey: 'arcade:completeItTitle',
    subKey: 'arcade:completeItSubtitle',
    Icon: CompleteItIcon,
  },
  {
    game: 'HANGMAN',
    titleKey: 'arcade:hangmanTitle',
    subKey: 'arcade:hangmanSubtitle',
    Icon: HangmanIcon,
  },
];

/** "Challenge {friend} to..." -- pick any Arcade game. */
export function ChallengeGameSheet({ friendName, onClose, onPick }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation(['friends', 'arcade', 'common']);

  if (!friendName) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common:close')}>
        <Pressable style={styles.sheet} onPress={() => {}} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <Text style={styles.title}>
            {t('friends:challenge.sheetTitle', { name: friendName })}
          </Text>
          {GAMES.map(({ game, titleKey, subKey, Icon }) => (
            <Pressable
              key={game}
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              onPress={() => onPick(game)}
              accessibilityRole="button"
              accessibilityLabel={t(titleKey)}
            >
              <Icon colors={colors} size={44} />
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>{t(titleKey)}</Text>
                <Text style={styles.optionSub} numberOfLines={2}>
                  {t(subKey)}
                </Text>
              </View>
            </Pressable>
          ))}
          <Pressable
            style={styles.cancel}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common:cancel')}
          >
            <Text style={styles.cancelText}>{t('common:cancel')}</Text>
          </Pressable>
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
