import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import type { ArcadeGameKind } from '@/services/arcadeStatus';
import { ARCADE_GAME_TITLE_KEY } from './gameTitles';

interface Props {
  /** The locked game the player tapped; null keeps the sheet closed. */
  game: ArcadeGameKind | null;
  onClose: () => void;
}

/** Slides up instead of opening a game whose 10 plays for today are used. */
export function ArcadeLockedSheet({ game, onClose }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation(['arcade', 'common']);
  if (!game) return null;
  const name = t(ARCADE_GAME_TITLE_KEY[game]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common:close')}>
        <Pressable style={styles.sheet} onPress={() => {}} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <Ionicons name="lock-closed-outline" size={32} color={colors.arcaneSoft} />
          <Text style={styles.title}>{t('arcade:plays.lockedTitle', { game: name })}</Text>
          <Text style={styles.sub}>{t('arcade:plays.lockedBody', { game: name })}</Text>
          <Text style={styles.plus}>{t('arcade:plays.plusHint')}</Text>
          <Pressable
            style={styles.button}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('arcade:plays.gotIt')}
          >
            <Text style={styles.buttonText}>{t('arcade:plays.gotIt')}</Text>
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
      alignItems: 'center',
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
    },
    sub: {
      color: colors.inkMuted,
      fontSize: typography.scale.md,
      textAlign: 'center',
      lineHeight: 22,
    },
    plus: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.sm,
      fontWeight: '700',
      textAlign: 'center',
    },
    button: {
      alignSelf: 'stretch',
      alignItems: 'center',
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      marginTop: spacing.sm,
    },
    buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
  });
}
