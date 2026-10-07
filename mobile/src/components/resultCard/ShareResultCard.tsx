import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { PodiumNightCard } from './PodiumNightCard';
import { QuestCardResult } from './QuestCardResult';
import { CARD_HEIGHT, CARD_WIDTH, type ResultCardData } from './types';
import { canShareFiles, downloadCardImage, shareCardImage, SUPPORTS_DOWNLOAD_BUTTON } from './shareCard';

export type ResultCardVariant = 'podium' | 'quest';

function Card({ data, variant }: { data: ResultCardData; variant: ResultCardVariant }) {
  return variant === 'podium' ? <PodiumNightCard data={data} /> : <QuestCardResult data={data} />;
}

/**
 * The result card shown on screen (scaled to fit narrow phones) with Share and,
 * on the web, Download buttons. The image that is shared is always rendered at
 * full size, so it looks the same on every device.
 */
export function ShareResultCard({
  data,
  variant,
  fileName = 'wordquest-result',
}: {
  data: ResultCardData;
  variant: ResultCardVariant;
  fileName?: string;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation('arcade');
  const { width } = useWindowDimensions();
  const scale = Math.min(1, (width - 32) / CARD_WIDTH);
  const shownRef = useRef<View>(null);
  const offRef = useRef<View>(null);
  const [busy, setBusy] = useState<'share' | 'download' | null>(null);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Web cannot capture a scaled element faithfully, so it renders a hidden full-size copy while saving.
  const [hiddenCopy, setHiddenCopy] = useState(false);

  const run = useCallback(
    async (mode: 'share' | 'download') => {
      if (busy) return;
      setBusy(mode);
      setError(false);
      setNotice(null);
      try {
        const needCopy = Platform.OS === 'web' && scale < 1;
        if (needCopy) {
          setHiddenCopy(true);
          await new Promise((r) => setTimeout(r, 250));
        }
        const node = needCopy ? offRef.current : shownRef.current;
        if (!node) throw new Error('no-node');
        const opts = { fileName, title: t('share.dialogTitle') };
        const out =
          mode === 'download' ? await downloadCardImage(node, opts) : await shareCardImage(node, opts);
        if (out === 'downloaded') setNotice(t('share.saved'));
      } catch {
        setError(true);
      } finally {
        setHiddenCopy(false);
        setBusy(null);
      }
    },
    [busy, fileName, scale, t],
  );

  return (
    <View style={styles.wrap}>
      <View
        style={{
          width: CARD_WIDTH * scale,
          height: CARD_HEIGHT * scale,
          borderRadius: 24 * scale,
          overflow: 'hidden',
        }}
      >
        <View
          ref={shownRef}
          collapsable={false}
          style={{
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            transform: [{ translateX: -(CARD_WIDTH * (1 - scale)) / 2 }, { translateY: -(CARD_HEIGHT * (1 - scale)) / 2 }, { scale }],
          }}
        >
          <Card data={data} variant={variant} />
        </View>
      </View>

      {hiddenCopy ? (
        <View style={styles.offscreen} pointerEvents="none">
          <View ref={offRef} collapsable={false} style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
            <Card data={data} variant={variant} />
          </View>
        </View>
      ) : null}

      <View style={styles.buttons}>
        {(Platform.OS !== 'web' || canShareFiles()) && (
          <Pressable
            style={[styles.primary, busy ? styles.disabled : null]}
            disabled={!!busy}
            onPress={() => run('share')}
            accessibilityRole="button"
            accessibilityLabel={t('share.share')}
          >
            {busy === 'share' ? (
              <ActivityIndicator color={'#fff'} />
            ) : (
              <Ionicons name="share-outline" size={18} color={'#fff'} />
            )}
            <Text style={styles.primaryText}>{busy === 'share' ? t('share.preparing') : t('share.share')}</Text>
          </Pressable>
        )}
        {SUPPORTS_DOWNLOAD_BUTTON && (
          <Pressable
            style={[canShareFiles() ? styles.secondary : styles.primary, busy ? styles.disabled : null]}
            disabled={!!busy}
            onPress={() => run('download')}
            accessibilityRole="button"
            accessibilityLabel={t('share.download')}
          >
            {busy === 'download' ? (
              <ActivityIndicator color={canShareFiles() ? colors.ink : '#fff'} />
            ) : (
              <Ionicons
                name="download-outline"
                size={18}
                color={canShareFiles() ? colors.ink : '#fff'}
              />
            )}
            <Text style={canShareFiles() ? styles.secondaryText : styles.primaryText}>
              {busy === 'download' ? t('share.preparing') : t('share.download')}
            </Text>
          </Pressable>
        )}
      </View>
      {error ? <Text style={styles.error}>{t('share.failed')}</Text> : null}
      {notice ? <Text style={styles.hint}>{notice}</Text> : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { alignItems: 'center', gap: spacing.md, width: '100%' },
    offscreen: { position: 'absolute', left: -10000, top: 0 },
    buttons: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
    primary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.arcane,
      borderRadius: radius.lg,
      paddingVertical: 12,
      paddingHorizontal: 20,
      minHeight: 44,
    },
    primaryText: { color: '#fff', fontSize: typography.scale.sm, fontWeight: '800' },
    secondary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 20,
      minHeight: 44,
    },
    secondaryText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '800' },
    disabled: { opacity: 0.6 },
    error: { color: colors.danger, fontSize: typography.scale.xs, textAlign: 'center' },
    hint: { color: colors.inkMuted, fontSize: typography.scale.xs, textAlign: 'center' },
  });
}
