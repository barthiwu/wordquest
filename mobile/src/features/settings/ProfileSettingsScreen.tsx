import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { resendVerification, verifyEmail } from '@/services/auth';
import {
  updateMe,
  checkUsernameAvailability,
  confirmAvatar,
  createAvatarUploadTarget,
  deleteAvatar,
  uploadAvatarBytes,
  type AvatarContentType,
} from '@/services/users';
import { useAuthStore } from '@/state/authStore';
import { AvatarImage } from '@/components/AvatarImage';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileSettings'>;

/**
 * Settings > Profile (Sept 2026 redesign, Barth) -- everything about
 * *your identity and account access* in one place: photo, name,
 * username, and email verification. Split out of SettingsScreen, which
 * used to show all of this inline; SettingsScreen now shows a single
 * identity-card row that opens here. The avatar picker here is the
 * same flow PassportScreen used to own directly -- moved rather than
 * duplicated, since Profile is now the one canonical place to edit any
 * of this, and PassportScreen's own header is a plain (non-editable)
 * identity display now.
 *
 * The picture-source picker is a small in-house Modal, not
 * Alert.alert -- react-native-web's Alert.alert is a no-op
 * (`static alert() {}`), so the multi-option action sheet this needs
 * (take photo / choose from library / remove / cancel) never
 * displayed anything on the web build, which is what made "change
 * profile picture" look completely dead there. Permission/error
 * feedback below uses the screen's existing inline `message` banner
 * for the same reason, instead of Alert.alert.
 */
export function ProfileSettingsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation(['settings', 'passport']);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMenuVisible, setAvatarMenuVisible] = useState(false);
  const [verifyToken, setVerifyToken] = useState('');
  const [busy, setBusy] = useState<'resend' | 'verify' | 'profile' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Local drafts so typing doesn't touch the authoritative authStore
  // value until Save succeeds.
  const [displayNameDraft, setDisplayNameDraft] = useState(user?.displayName ?? '');
  const [usernameDraft, setUsernameDraft] = useState(user?.username ?? '');
  const [usernameCheck, setUsernameCheck] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const usernameCheckSeq = useRef(0);

  useEffect(() => {
    setDisplayNameDraft(user?.displayName ?? '');
    setUsernameDraft(user?.username ?? '');
  }, [user?.displayName, user?.username]);

  const USERNAME_FORMAT = /^[a-z0-9_]{3,20}$/;

  useEffect(() => {
    if (!accessToken) return;
    const candidate = usernameDraft.trim().toLowerCase();
    if (candidate === (user?.username ?? '')) {
      setUsernameCheck('idle');
      return;
    }
    if (!USERNAME_FORMAT.test(candidate)) {
      setUsernameCheck('invalid');
      return;
    }
    setUsernameCheck('checking');
    const seq = ++usernameCheckSeq.current;
    const timer = setTimeout(async () => {
      try {
        const { available } = await checkUsernameAvailability(accessToken, candidate);
        if (usernameCheckSeq.current === seq) setUsernameCheck(available ? 'available' : 'taken');
      } catch {
        if (usernameCheckSeq.current === seq) setUsernameCheck('idle');
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [usernameDraft, accessToken, user?.username]);

  const profileDirty =
    displayNameDraft.trim() !== (user?.displayName ?? '') ||
    usernameDraft.trim().toLowerCase() !== (user?.username ?? '');
  const usernameBlocksSave =
    usernameCheck === 'invalid' || usernameCheck === 'taken' || usernameCheck === 'checking';

  const onSaveProfile = async () => {
    if (!accessToken || !profileDirty || usernameBlocksSave) return;
    setBusy('profile');
    setMessage(null);
    try {
      const patch: { displayName?: string; username?: string } = {};
      if (displayNameDraft.trim() !== (user?.displayName ?? ''))
        patch.displayName = displayNameDraft.trim();
      const normalizedUsername = usernameDraft.trim().toLowerCase();
      if (normalizedUsername !== (user?.username ?? '')) patch.username = normalizedUsername;

      const updated = await updateMe(accessToken, patch);
      updateUser({ displayName: updated.displayName, username: updated.username });
      setUsernameCheck('idle');
      setMessage(t('messageProfileUpdated'));
    } catch (err) {
      setMessage(
        err instanceof Error && err.message.toLowerCase().includes('taken')
          ? t('errorUsernameTaken')
          : t('errorProfileSave'),
      );
    } finally {
      setBusy(null);
    }
  };

  const onResendVerification = async () => {
    if (!accessToken) return;
    setBusy('resend');
    setMessage(null);
    try {
      await resendVerification(accessToken);
      setMessage(t('messageVerificationSent'));
    } catch {
      setMessage(t('errorVerificationSend'));
    } finally {
      setBusy(null);
    }
  };

  const onVerifyEmail = async () => {
    if (!verifyToken.trim()) return;
    setBusy('verify');
    setMessage(null);
    try {
      await verifyEmail(verifyToken.trim());
      setMessage(t('messageEmailVerified'));
      setVerifyToken('');
    } catch {
      setMessage(t('errorVerificationInvalid'));
    } finally {
      setBusy(null);
    }
  };

  const pickAndUploadAvatar = async (source: 'camera' | 'library') => {
    if (!accessToken) return;
    setMessage(null);
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage(
        t('passport:permissionNeededMessage', {
          access:
            source === 'camera'
              ? t('passport:cameraAccessLabel')
              : t('passport:photoLibraryAccessLabel'),
        }),
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.8,
            allowsEditing: true,
            aspect: [1, 1],
          });
    if (result.canceled) return;

    const asset = result.assets[0];
    const contentType: AvatarContentType =
      asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';

    setAvatarBusy(true);
    try {
      const target = await createAvatarUploadTarget(accessToken, contentType);
      await uploadAvatarBytes(target.uploadUrl, asset.uri, contentType);
      const confirmed = await confirmAvatar(accessToken, target.key);
      updateUser({ avatarUrl: confirmed.avatarUrl });
    } catch (err) {
      // Surface the real failure reason, not just a generic retry prompt:
      // uploadAvatarBytes() throws a plain Error (not ApiError) for the
      // direct-to-R2 PUT step (a CORS block, an expired/invalid presigned
      // URL, or a non-2xx from the bucket), and that reason is exactly
      // what's needed to diagnose a storage-config problem live, without
      // browser devtools access.
      setMessage(
        `${t('passport:couldNotSetProfilePicture')} ${
          err instanceof Error ? err.message : t('passport:genericTryAgain')
        }`,
      );
    } finally {
      setAvatarBusy(false);
    }
  };

  const onRemoveAvatar = async () => {
    if (!accessToken) return;
    setMessage(null);
    setAvatarBusy(true);
    try {
      const result = await deleteAvatar(accessToken);
      updateUser({ avatarUrl: result.avatarUrl });
    } catch {
      setMessage(`${t('passport:couldNotRemoveProfilePicture')} ${t('passport:genericTryAgain')}`);
    } finally {
      setAvatarBusy(false);
    }
  };

  const onAvatarPress = () => {
    setAvatarMenuVisible(true);
  };

  const onAvatarMenuSelect = (action: 'camera' | 'library' | 'remove') => {
    setAvatarMenuVisible(false);
    if (action === 'remove') {
      onRemoveAvatar();
    } else {
      pickAndUploadAvatar(action);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('profileSection')}</Text>
      <Text style={styles.subtitle}>{t('profileSectionSubtitle')}</Text>

      {message && <Text style={styles.message}>{message}</Text>}

      <View style={styles.avatarBlock}>
        <Pressable
          style={styles.avatarWrapper}
          onPress={onAvatarPress}
          disabled={avatarBusy}
          accessibilityRole="button"
          accessibilityLabel={t('passport:changeProfilePicture')}
        >
          {user?.avatarUrl ? (
            <AvatarImage
              uri={user.avatarUrl}
              style={styles.avatarImage}
              onFail={() => void useAuthStore.getState().refreshAvatar()}
              fallback={
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>
                    {user?.displayName?.trim().charAt(0).toUpperCase() || '?'}
                  </Text>
                </View>
              }
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {user?.displayName?.trim().charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <View style={styles.avatarBadge}>
            {avatarBusy ? (
              <ActivityIndicator size="small" color={colors.ink} />
            ) : (
              <Ionicons name="camera" size={13} color={colors.ink} />
            )}
          </View>
        </Pressable>
        <Text style={styles.avatarCaption}>{t('passport:changeProfilePicture')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profileSection')}</Text>

        <Text style={styles.fieldLabel}>{t('yourName')}</Text>
        <TextInput
          style={styles.input}
          value={displayNameDraft}
          onChangeText={setDisplayNameDraft}
          placeholder={t('yourNamePlaceholder')}
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={t('yourName')}
        />
        <Text style={styles.fieldHint}>{t('yourNameHint')}</Text>

        <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>{t('usernameLabel')}</Text>
        <TextInput
          style={styles.input}
          value={usernameDraft}
          onChangeText={(v) => setUsernameDraft(v.toLowerCase())}
          placeholder={t('usernamePlaceholder')}
          placeholderTextColor={colors.inkMuted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('usernameLabel')}
        />
        <Text style={styles.fieldHint}>{t('usernameHint')}</Text>
        {usernameCheck === 'checking' && (
          <Text style={styles.usernameStatusChecking}>{t('usernameChecking')}</Text>
        )}
        {usernameCheck === 'available' && (
          <Text style={styles.usernameStatusOk}>{t('usernameAvailable')}</Text>
        )}
        {usernameCheck === 'taken' && (
          <Text style={styles.usernameStatusBad}>{t('usernameTaken')}</Text>
        )}
        {usernameCheck === 'invalid' && (
          <Text style={styles.usernameStatusBad}>{t('usernameInvalid')}</Text>
        )}

        <Pressable
          style={[
            styles.secondaryButton,
            (!profileDirty || usernameBlocksSave) && styles.buttonDisabled,
          ]}
          onPress={onSaveProfile}
          disabled={busy !== null || !profileDirty || usernameBlocksSave}
          accessibilityRole="button"
          accessibilityLabel={t('saveProfile')}
        >
          {busy === 'profile' ? (
            <ActivityIndicator color={colors.arcaneSoft} />
          ) : (
            <Text style={styles.secondaryButtonText}>{t('saveProfile')}</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('emailVerificationSection')}</Text>
        <Pressable
          style={styles.secondaryButton}
          onPress={onResendVerification}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel={t('resendVerification')}
        >
          {busy === 'resend' ? (
            <ActivityIndicator color={colors.arcaneSoft} />
          ) : (
            <Text style={styles.secondaryButtonText}>{t('resendVerification')}</Text>
          )}
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder={t('verificationCodePlaceholder')}
          placeholderTextColor={colors.inkMuted}
          value={verifyToken}
          onChangeText={setVerifyToken}
          autoCapitalize="none"
          accessibilityLabel={t('verificationCodePlaceholder')}
        />
        <Pressable
          style={[styles.secondaryButton, !verifyToken.trim() && styles.buttonDisabled]}
          onPress={onVerifyEmail}
          disabled={busy !== null || !verifyToken.trim()}
          accessibilityRole="button"
          accessibilityLabel={t('verifyEmail')}
        >
          {busy === 'verify' ? (
            <ActivityIndicator color={colors.arcaneSoft} />
          ) : (
            <Text style={styles.secondaryButtonText}>{t('verifyEmail')}</Text>
          )}
        </Pressable>
      </View>

      <Modal
        visible={avatarMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarMenuVisible(false)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setAvatarMenuVisible(false)}
          accessibilityLabel={t('passport:cancel')}
        >
          <Pressable style={styles.menuCard} onPress={() => {}}>
            <Text style={styles.menuTitle}>{t('passport:profilePictureTitle')}</Text>
            <Pressable
              style={styles.menuRow}
              onPress={() => onAvatarMenuSelect('camera')}
              accessibilityRole="button"
              accessibilityLabel={t('passport:takePhoto')}
            >
              <Text style={styles.menuRowText}>{t('passport:takePhoto')}</Text>
            </Pressable>
            <Pressable
              style={styles.menuRow}
              onPress={() => onAvatarMenuSelect('library')}
              accessibilityRole="button"
              accessibilityLabel={t('passport:chooseFromLibrary')}
            >
              <Text style={styles.menuRowText}>{t('passport:chooseFromLibrary')}</Text>
            </Pressable>
            {user?.avatarUrl && (
              <Pressable
                style={styles.menuRow}
                onPress={() => onAvatarMenuSelect('remove')}
                accessibilityRole="button"
                accessibilityLabel={t('passport:removePhoto')}
              >
                <Text style={styles.menuRowTextDanger}>{t('passport:removePhoto')}</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.menuCancelRow}
              onPress={() => setAvatarMenuVisible(false)}
              accessibilityRole="button"
              accessibilityLabel={t('passport:cancel')}
            >
              <Text style={styles.menuCancelText}>{t('passport:cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.xl, paddingTop: topInset + spacing.xxl, gap: spacing.lg },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.sm, marginTop: -spacing.md },
    message: { color: colors.arcaneSoft, fontSize: typography.scale.sm },
    avatarBlock: { alignItems: 'center', gap: spacing.sm },
    avatarWrapper: { position: 'relative' },
    avatarImage: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.surfaceRaised,
    },
    avatarPlaceholder: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      color: colors.inkMuted,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    avatarBadge: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.arcane,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    avatarCaption: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '600' },
    section: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    sectionTitle: {
      color: colors.ink,
      fontSize: typography.scale.sm,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.ink,
      fontSize: typography.scale.md,
    },
    secondaryButton: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    secondaryButtonText: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.md,
      fontWeight: '700',
    },
    buttonDisabled: { opacity: 0.4 },
    fieldLabel: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    fieldHint: { color: colors.inkMuted, fontSize: typography.scale.xs },
    usernameStatusChecking: { color: colors.inkMuted, fontSize: typography.scale.xs },
    usernameStatusOk: { color: colors.success, fontSize: typography.scale.xs, fontWeight: '700' },
    usernameStatusBad: { color: colors.warning, fontSize: typography.scale.xs, fontWeight: '700' },
    menuBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    menuCard: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    menuTitle: {
      color: colors.ink,
      fontSize: typography.scale.md,
      fontWeight: typography.display.weight,
      textAlign: 'center',
      marginBottom: spacing.xs,
    },
    menuRow: {
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      alignItems: 'center',
    },
    menuRowText: { color: colors.ink, fontSize: typography.scale.md },
    menuRowTextDanger: { color: colors.danger, fontSize: typography.scale.md },
    menuCancelRow: { alignItems: 'center', paddingTop: spacing.sm },
    menuCancelText: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '700' },
  });
}
