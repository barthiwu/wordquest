import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useIsPrototype } from '@/state/uiVersionStore';
import { useAuthStore } from '@/state/authStore';
import { ApiError } from '@/services/apiClient';
import {
  beginTwoFactorSetup,
  disableTwoFactor,
  enableTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
  type TwoFactorStatus,
} from '@/services/auth';
import { BackButton } from '@/components/BackButton';
import { AuthPrimaryButton } from '@/features/auth/AuthPrimaryButton';
import { AliScene } from '@/features/proto/ui/AliScene';
import { GlassCard, ProtoButton } from '@/features/proto/ui/ProtoUI';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'TwoFactor'>;

type Mode =
  | { kind: 'loading' }
  | { kind: 'status'; status: TwoFactorStatus }
  | { kind: 'setup'; secret: string; otpauthUrl: string }
  | { kind: 'codes'; codes: string[] };

/** What the status screen is asking a code for before it acts. */
type Pending = 'disable' | 'regenerate' | null;

/**
 * Settings → Two-step verification (TOTP). Turn on: scan the QR (or type the
 * key) into an authenticator app, confirm with a first code, then save the
 * one-time recovery codes. Turning it off or regenerating recovery codes
 * needs a current code, so a stolen session alone can't weaken the account.
 */
export function TwoFactorSettingsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const proto = useIsPrototype();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('settings');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [mode, setMode] = useState<Mode>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!accessToken) return;
    try {
      setMode({ kind: 'status', status: await getTwoFactorStatus(accessToken) });
    } catch {
      setError(t('twoFactor.errorGeneric'));
      setMode({ kind: 'status', status: { enabled: false, recoveryCodesRemaining: 0 } });
    }
  }, [accessToken, t]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 401 || err.status === 400)
          ? t('twoFactor.errorCode')
          : t('twoFactor.errorGeneric'),
      );
    } finally {
      setBusy(false);
    }
  };

  const startSetup = () =>
    run(async () => {
      if (!accessToken) return;
      const { secret, otpauthUrl } = await beginTwoFactorSetup(accessToken);
      setCode('');
      setMode({ kind: 'setup', secret, otpauthUrl });
    });

  const confirmSetup = () =>
    run(async () => {
      if (!accessToken) return;
      const { recoveryCodes } = await enableTwoFactor(accessToken, code.trim());
      setCode('');
      setMode({ kind: 'codes', codes: recoveryCodes });
    });

  const confirmPending = () =>
    run(async () => {
      if (!accessToken || !pending) return;
      if (pending === 'disable') {
        await disableTwoFactor(accessToken, code.trim());
        setPending(null);
        setCode('');
        await loadStatus();
      } else {
        const { recoveryCodes } = await regenerateRecoveryCodes(accessToken, code.trim());
        setPending(null);
        setCode('');
        setMode({ kind: 'codes', codes: recoveryCodes });
      }
    });

  const shareCodes = async (codes: string[]) => {
    try {
      await Share.share({ message: `${t('twoFactor.shareHeader')}\n\n${codes.join('\n')}` });
    } catch {
      // Sharing is a convenience; the codes are on screen.
    }
  };

  const Primary = proto
    ? ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
        <ProtoButton label={label} onPress={onPress} disabled={disabled || busy} />
      )
    : ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
        <AuthPrimaryButton label={label} onPress={onPress} disabled={disabled} loading={busy} />
      );
  const Secondary = ({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) =>
    proto ? (
      <ProtoButton variant={danger ? 'danger' : 'outline'} label={label} onPress={onPress} disabled={busy} />
    ) : (
      <Text onPress={onPress} accessibilityRole="button" style={[styles.linkBtn, danger && { color: colors.danger }]}>
        {label}
      </Text>
    );

  const codeInput = (
    <TextInput
      style={styles.input}
      placeholder={t('twoFactor.codePlaceholder')}
      placeholderTextColor={colors.inkMuted}
      value={code}
      onChangeText={setCode}
      autoCapitalize="characters"
      autoCorrect={false}
      maxLength={16}
      accessibilityLabel={t('twoFactor.codePlaceholder')}
    />
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('twoFactor.title')}</Text>

      {proto && mode.kind !== 'loading' ? (
        <AliScene
          variant="forest"
          height={150}
          expression={mode.kind === 'status' && mode.status.enabled ? 'PROUD' : 'CURIOUS'}
          message={mode.kind === 'status' && mode.status.enabled ? t('twoFactor.aliOn') : t('twoFactor.aliOff')}
          style={styles.scene}
        />
      ) : null}

      {mode.kind === 'loading' && <ActivityIndicator color={colors.arcaneSoft} />}

      {mode.kind === 'status' && !mode.status.enabled && (
        <View style={styles.block}>
          <Text style={styles.body}>{t('twoFactor.intro')}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Primary label={t('twoFactor.turnOn')} onPress={startSetup} />
        </View>
      )}

      {mode.kind === 'status' && mode.status.enabled && (
        <View style={styles.block}>
          <Text style={[styles.badge, { color: colors.success }]}>{t('twoFactor.statusOn')}</Text>
          <Text style={styles.body}>
            {t('twoFactor.recoveryLeft', { count: mode.status.recoveryCodesRemaining })}
          </Text>
          {pending ? (
            <>
              <Text style={styles.body}>{t(pending === 'disable' ? 'twoFactor.enterToDisable' : 'twoFactor.enterToRegenerate')}</Text>
              {codeInput}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Primary
                label={t(pending === 'disable' ? 'twoFactor.turnOffConfirm' : 'twoFactor.regenerateConfirm')}
                onPress={confirmPending}
                disabled={code.replace(/[\s-]/g, '').length < 6}
              />
              <Secondary
                label={t('twoFactor.cancel')}
                onPress={() => {
                  setPending(null);
                  setCode('');
                  setError(null);
                }}
              />
            </>
          ) : (
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Secondary label={t('twoFactor.regenerate')} onPress={() => setPending('regenerate')} />
              <Secondary label={t('twoFactor.turnOff')} danger onPress={() => setPending('disable')} />
            </>
          )}
        </View>
      )}

      {mode.kind === 'setup' && (
        <View style={styles.block}>
          <Text style={styles.stepTitle}>{t('twoFactor.step1')}</Text>
          <View style={styles.qrWrap}>
            <QRCode value={mode.otpauthUrl} size={176} backgroundColor="#FFFFFF" color="#12102A" />
          </View>
          <Text style={styles.body}>{t('twoFactor.manualKey')}</Text>
          <Text selectable style={styles.secret}>
            {mode.secret.replace(/(.{4})/g, '$1 ').trim()}
          </Text>
          <Text style={styles.stepTitle}>{t('twoFactor.step2')}</Text>
          {codeInput}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Primary label={t('twoFactor.confirm')} onPress={confirmSetup} disabled={code.replace(/\s/g, '').length < 6} />
          <Secondary
            label={t('twoFactor.cancel')}
            onPress={() => {
              setCode('');
              setError(null);
              loadStatus();
            }}
          />
        </View>
      )}

      {mode.kind === 'codes' && (
        <View style={styles.block}>
          <Text style={styles.body}>{t('twoFactor.codesIntro')}</Text>
          {proto ? (
            <GlassCard style={styles.codesBox}>
              <CodeGrid codes={mode.codes} colors={colors} />
            </GlassCard>
          ) : (
            <View style={[styles.codesBox, styles.codesBoxClassic]}>
              <CodeGrid codes={mode.codes} colors={colors} />
            </View>
          )}
          <Secondary label={t('twoFactor.shareCodes')} onPress={() => shareCodes(mode.codes)} />
          <Primary label={t('twoFactor.savedThem')} onPress={loadStatus} />
        </View>
      )}
    </ScrollView>
  );
}

function CodeGrid({ codes, colors }: { codes: string[]; colors: ThemeColors }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {codes.map((c) => (
        <Text
          key={c}
          selectable
          style={{ width: '47%', color: colors.ink, fontSize: 16, fontWeight: '700', letterSpacing: 1, fontVariant: ['tabular-nums'] }}
        >
          {c}
        </Text>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      padding: spacing.xl,
      paddingTop: topInset + spacing.xxl,
      gap: spacing.lg,
      maxWidth: 640,
      width: '100%',
      alignSelf: 'center',
    },
    title: { color: colors.ink, fontSize: typography.scale.xl, fontWeight: typography.display.weight },
    scene: { borderRadius: 20, overflow: 'hidden' },
    block: { gap: spacing.md },
    body: { color: colors.inkMuted, fontSize: typography.scale.md, lineHeight: 22 },
    badge: { fontSize: typography.scale.lg, fontWeight: '800' },
    stepTitle: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '800' },
    qrWrap: { alignSelf: 'center', padding: 12, backgroundColor: '#FFFFFF', borderRadius: radius.md },
    secret: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700', letterSpacing: 2, textAlign: 'center' },
    input: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      color: colors.ink,
      fontSize: typography.scale.lg,
      letterSpacing: 4,
      textAlign: 'center',
    },
    error: { color: colors.danger, fontSize: typography.scale.sm },
    linkBtn: { color: colors.arcaneSoft, fontSize: typography.scale.md, fontWeight: '700', textAlign: 'center', paddingVertical: spacing.sm },
    codesBox: { padding: spacing.lg },
    codesBoxClassic: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  });
}
