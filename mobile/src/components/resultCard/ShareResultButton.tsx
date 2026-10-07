import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { ShareResultCard, type ResultCardVariant } from './ShareResultCard';
import type { ResultCardData } from './types';

/** "Share result" button that opens the card in a sheet with Share / Download. */
export function ShareResultButton({
  data,
  variant = 'quest',
  fileName,
}: {
  data: ResultCardData | null;
  variant?: ResultCardVariant;
  fileName?: string;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation('arcade');
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <>
      <Pressable
        style={styles.button}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('share.open')}
      >
        <Ionicons name="share-social-outline" size={18} color={colors.ink} />
        <Text style={styles.buttonText}>{t('share.open')}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <ScrollView
            contentContainerStyle={[
              styles.sheet,
              { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
            ]}
          >
            <Pressable
              style={styles.close}
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel={t('share.close')}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
            <ShareResultCard data={data} variant={variant} fileName={fileName} />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingVertical: 12,
      paddingHorizontal: 20,
      minHeight: 44,
    },
    buttonText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '800' },
    backdrop: { flex: 1, backgroundColor: 'rgba(8,6,24,0.92)' },
    sheet: { alignItems: 'center', gap: spacing.md, paddingHorizontal: 16 },
    close: {
      alignSelf: 'flex-end',
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
  });
}
