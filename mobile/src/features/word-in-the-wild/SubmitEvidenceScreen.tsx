import { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import {
  createPhotoUploadTarget,
  submitPhotoEvidence,
  submitTextEvidence,
  uploadPhotoToR2,
  type PhotoContentType,
} from '@/services/word-in-the-wild';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { useEvidenceModeStore } from '@/state/evidenceModeStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'SubmitEvidence'>;
type Mode = 'TEXT' | 'PHOTO';
type Stage = 'idle' | 'uploading' | 'assessing';

const MODE_ICONS: Record<
  Mode,
  { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
> = {
  TEXT: { active: 'document-text', inactive: 'document-text-outline' },
  PHOTO: { active: 'camera', inactive: 'camera-outline' },
};

/**
 * Text evidence goes straight to the backend, which does the assessing.
 * Photo evidence is a three-step client flow: get a presigned R2 URL,
 * PUT the bytes directly to R2 (never through our backend), then tell
 * the backend the key so it can fetch the bytes back server-side and
 * assess them. Each step has its own failure mode, so `stage` drives
 * what the loading indicator actually says.
 *
 * The mode tabs default to whatever the player used last (useEvidenceModeStore)
 * rather than always opening on Text — the camera option exists but was easy
 * to miss when every mission reset back to the Text tab.
 */
export function SubmitEvidenceScreen({ route, navigation }: Props) {
  const { t } = useTranslation('submitEvidence');
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { missionId, word, definition } = route.params;
  const accessToken = useAuthStore((s) => s.accessToken);
  const lastMode = useEvidenceModeStore((s) => s.lastMode);
  const setLastMode = useEvidenceModeStore((s) => s.setLastMode);
  const [mode, setModeState] = useState<Mode>(lastMode);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; contentType: PhotoContentType } | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);

  const setMode = (next: Mode) => {
    setModeState(next);
    setLastMode(next);
  };

  const pickPhoto = async (source: 'camera' | 'library') => {
    setError(null);
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        source === 'camera' ? t('cameraPermissionNeeded') : t('photoLibraryPermissionNeeded'),
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });

    if (result.canceled) return;
    const asset = result.assets[0];
    setPhoto({
      uri: asset.uri,
      contentType: asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
    });
  };

  const onSubmitText = async () => {
    if (!accessToken || !text.trim()) return;
    setStage('assessing');
    setError(null);
    try {
      const submission = await submitTextEvidence(accessToken, missionId, text.trim());
      navigation.replace('EvidenceResult', submission);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('submitError'));
      setStage('idle');
    }
  };

  const onSubmitPhoto = async () => {
    if (!accessToken || !photo) return;
    setError(null);
    try {
      setStage('uploading');
      const target = await createPhotoUploadTarget(accessToken, missionId, photo.contentType);
      await uploadPhotoToR2(target.uploadUrl, photo.uri, photo.contentType);

      setStage('assessing');
      const submission = await submitPhotoEvidence(accessToken, missionId, target.key);
      navigation.replace('EvidenceResult', submission);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('submitError'));
      setStage('idle');
    }
  };

  const busy = stage !== 'idle';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('title', { word })}</Text>
      <Text style={styles.definition}>{definition}</Text>

      <View style={styles.modeTabs}>
        <ModeTab
          label={t('tabText')}
          icon={mode === 'TEXT' ? MODE_ICONS.TEXT.active : MODE_ICONS.TEXT.inactive}
          active={mode === 'TEXT'}
          onPress={() => setMode('TEXT')}
          disabled={busy}
          styles={styles}
          colors={colors}
        />
        <ModeTab
          label={t('tabPhoto')}
          icon={mode === 'PHOTO' ? MODE_ICONS.PHOTO.active : MODE_ICONS.PHOTO.inactive}
          active={mode === 'PHOTO'}
          onPress={() => setMode('PHOTO')}
          disabled={busy}
          styles={styles}
          colors={colors}
        />
      </View>

      {mode === 'TEXT' && (
        <View style={styles.section}>
          <Text style={styles.hint}>{t('textHint')}</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={4}
            placeholder={t('textPlaceholder', { word })}
            placeholderTextColor={colors.inkMuted}
            value={text}
            onChangeText={setText}
            editable={!busy}
            accessibilityLabel={t('textInputAccessibilityLabel')}
          />
          <Pressable
            style={[styles.submitButton, (!text.trim() || busy) && styles.submitButtonDisabled]}
            onPress={onSubmitText}
            disabled={!text.trim() || busy}
            accessibilityRole="button"
            accessibilityLabel={t('submitAccessibilityLabel')}
          >
            {busy ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.submitButtonText}>{t('submitButtonText')}</Text>
            )}
          </Pressable>
        </View>
      )}

      {mode === 'PHOTO' && (
        <View style={styles.section}>
          <Text style={styles.hint}>{t('photoHint')}</Text>

          {photo && <Image source={{ uri: photo.uri }} style={styles.preview} />}

          <View style={styles.photoButtonsRow}>
            <Pressable
              style={styles.photoButton}
              onPress={() => pickPhoto('camera')}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('takePhotoAccessibilityLabel')}
            >
              <Ionicons name="camera-outline" size={18} color={colors.arcaneSoft} />
              <Text style={styles.photoButtonText}>{t('takePhotoText')}</Text>
            </Pressable>
            <Pressable
              style={styles.photoButton}
              onPress={() => pickPhoto('library')}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('choosePhotoAccessibilityLabel')}
            >
              <Ionicons name="images-outline" size={18} color={colors.arcaneSoft} />
              <Text style={styles.photoButtonText}>{t('choosePhotoText')}</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.submitButton, (!photo || busy) && styles.submitButtonDisabled]}
            onPress={onSubmitPhoto}
            disabled={!photo || busy}
            accessibilityRole="button"
            accessibilityLabel={t('submitAccessibilityLabel')}
          >
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color={colors.ink} />
                <Text style={styles.submitButtonText}>
                  {stage === 'uploading' ? t('uploadingText') : t('assessingText')}
                </Text>
              </View>
            ) : (
              <Text style={styles.submitButtonText}>{t('submitButtonText')}</Text>
            )}
          </Pressable>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

function ModeTab({
  label,
  icon,
  active,
  onPress,
  disabled,
  styles,
  colors,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
  disabled: boolean;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.modeTab, active && styles.modeTabActive]}
    >
      <Ionicons name={icon} size={16} color={active ? colors.ink : colors.inkMuted} />
      <Text style={[styles.modeTabText, active && styles.modeTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      paddingTop: topInset + spacing.xl,
      gap: spacing.md,
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    definition: { color: colors.inkMuted, fontSize: typography.scale.sm },
    modeTabs: { flexDirection: 'row', gap: spacing.sm },
    modeTab: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      gap: spacing.xs,
    },
    modeTabActive: { backgroundColor: colors.arcane, borderColor: colors.arcane },
    modeTabText: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
    modeTabTextActive: { color: colors.ink },
    section: { gap: spacing.sm },
    hint: { color: colors.inkMuted, fontSize: typography.scale.xs },
    textArea: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      color: colors.ink,
      fontSize: typography.scale.md,
      minHeight: 100,
      textAlignVertical: 'top',
    },
    preview: {
      width: '100%',
      height: 220,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    photoButtonsRow: { flexDirection: 'row', gap: spacing.sm },
    photoButton: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      alignItems: 'center',
      gap: spacing.xs,
    },
    photoButtonText: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '700' },
    submitButton: {
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    submitButtonDisabled: { opacity: 0.4 },
    submitButtonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    busyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    error: { color: colors.danger, fontSize: typography.scale.sm },
  });
}
