import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { ApiError } from '@/services/apiClient';
import { joinGroupAsGuest, type GroupPreview, type GuestJoinResult } from '@/services/arcadeGroups';

const NICKNAME_MIN = 2;
const NICKNAME_MAX = 20;

/**
 * What a group link shows to someone with no account: who is hosting, and a
 * name box to jump straight in. Group Play is for anyone (a game night, a
 * family, a class), so an account is never required; signing in or creating
 * one stays one tap away.
 */
export function GuestJoinPanel({
  code,
  preview,
  gameName,
  onJoined,
  onLogin,
  onRegister,
}: {
  code: string;
  preview: GroupPreview;
  gameName: string;
  onJoined: (result: GuestJoinResult) => void;
  onLogin: () => void;
  onRegister: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation('arcade');
  const [nickname, setNickname] = useState('');
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = nickname.trim();
  const nameOk = trimmed.length >= NICKNAME_MIN && trimmed.length <= NICKNAME_MAX;

  const join = async () => {
    if (busy) return;
    if (!nameOk)
      return setError(t('group.guest.nicknameShort', { min: NICKNAME_MIN, max: NICKNAME_MAX }));
    if (!adult) return setError(t('group.guest.ageRequired'));
    setBusy(true);
    setError(null);
    try {
      onJoined(await joinGroupAsGuest(code, trimmed));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('group.join.error'));
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">
        {preview.title ?? gameName}
      </Text>
      <Text style={styles.sub}>
        {gameName} · {t('group.join.host', { name: preview.hostUsername })}
      </Text>
      <Text style={styles.sub}>
        {t('group.join.players', { count: preview.memberCount, max: preview.maxMembers })}
      </Text>

      {preview.full ? (
        <Text style={styles.error}>{t('group.join.full')}</Text>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('group.guest.joinTitle')}</Text>
          <Text style={styles.hint}>{t('group.guest.joinHint')}</Text>
          <Text style={styles.label}>{t('group.guest.nicknameLabel')}</Text>
          <TextInput
            style={styles.input}
            value={nickname}
            onChangeText={(v) => {
              setNickname(v.slice(0, NICKNAME_MAX));
              setError(null);
            }}
            placeholder={t('group.guest.nicknamePlaceholder')}
            placeholderTextColor={colors.inkMuted}
            maxLength={NICKNAME_MAX}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => void join()}
            accessibilityLabel={t('group.guest.nicknameLabel')}
          />
          <Pressable
            style={styles.checkRow}
            onPress={() => {
              setAdult((v) => !v);
              setError(null);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: adult }}
            accessibilityLabel={t('group.guest.ageConfirm')}
          >
            <View style={[styles.box, adult && styles.boxOn]}>
              {adult ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
            </View>
            <Text style={styles.checkText}>{t('group.guest.ageConfirm')}</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={[styles.button, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void join()}
            accessibilityRole="button"
            accessibilityLabel={t('group.guest.joinButton')}
          >
            {busy ? <ActivityIndicator color="#fff" /> : null}
            <Text style={styles.buttonText}>
              {busy ? t('group.join.joining') : t('group.guest.joinButton')}
            </Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.or}>{t('group.guest.orAccount')}</Text>
      <View style={styles.row}>
        <Pressable
          style={styles.ghost}
          onPress={onLogin}
          accessibilityRole="button"
          accessibilityLabel={t('group.guest.logIn')}
        >
          <Text style={styles.ghostText}>{t('group.guest.logIn')}</Text>
        </Pressable>
        <Pressable
          style={styles.ghost}
          onPress={onRegister}
          accessibilityRole="button"
          accessibilityLabel={t('group.guest.createAccount')}
        >
          <Text style={styles.ghostText}>{t('group.guest.createAccount')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      alignItems: 'center',
      gap: spacing.sm,
      width: '100%',
      maxWidth: 440,
      alignSelf: 'center',
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: '800',
      textAlign: 'center',
    },
    sub: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
    card: {
      width: '100%',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginTop: spacing.sm,
    },
    cardTitle: { color: colors.ink, fontSize: typography.scale.lg, fontWeight: '800' },
    hint: { color: colors.inkMuted, fontSize: typography.scale.sm, lineHeight: 20 },
    label: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '800',
      letterSpacing: 1,
    },
    input: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      color: colors.ink,
      fontSize: typography.scale.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      minHeight: 48,
    },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
    box: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.inkMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxOn: { backgroundColor: colors.arcane, borderColor: colors.arcane },
    checkText: { flex: 1, color: colors.ink, fontSize: typography.scale.sm },
    error: { color: colors.danger, fontSize: typography.scale.sm, textAlign: 'center' },
    button: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.arcane,
      borderRadius: radius.lg,
      paddingVertical: 14,
      minHeight: 48,
    },
    buttonText: { color: '#fff', fontSize: typography.scale.md, fontWeight: '800' },
    disabled: { opacity: 0.6 },
    or: { color: colors.inkMuted, fontSize: typography.scale.sm, marginTop: spacing.md },
    row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
    ghost: {
      borderColor: colors.border,
      borderWidth: 1.5,
      borderRadius: radius.lg,
      paddingVertical: 12,
      paddingHorizontal: 18,
      minHeight: 44,
      justifyContent: 'center',
    },
    ghostText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '800' },
  });
}
