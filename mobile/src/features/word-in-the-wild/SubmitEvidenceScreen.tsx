import { useState } from 'react';
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
import { colors, radius, spacing, typography } from '@/constants/theme';
import {
  createPhotoUploadTarget,
  submitPhotoEvidence,
  submitTextEvidence,
  uploadPhotoToR2,
  type PhotoContentType,
} from '@/services/word-in-the-wild';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'SubmitEvidence'>;
type Mode = 'TEXT' | 'PHOTO';
type Stage = 'idle' | 'uploading' | 'assessing';

/**
 * Text evidence goes straight to the backend, which does the assessing.
 * Photo evidence is a three-step client flow: get a presigned R2 URL,
 * PUT the bytes directly to R2 (never through our backend), then tell
 * the backend the key so it can fetch the bytes back server-side and
 * assess them. Each step has its own failure mode, so `stage` drives
 * what the loading indicator actually says.
 */
export function SubmitEvidenceScreen({ route, navigation }: Props) {
  const { missionId, word, definition } = route.params;
  const accessToken = useAuthStore((s) => s.accessToken);
  const [mode, setMode] = useState<Mode>('TEXT');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; contentType: PhotoContentType } | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);

  const pickPhoto = async (source: 'camera' | 'library') => {
    setError(null);
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        `WordQuest needs ${source === 'camera' ? 'camera' : 'photo library'} access to do this.`,
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
      setError(err instanceof ApiError ? err.message : 'Could not submit your evidence.');
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
      setError(err instanceof ApiError ? err.message : 'Could not submit your evidence.');
      setStage('idle');
    }
  };

  const busy = stage !== 'idle';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Find “{word}”</Text>
      <Text style={styles.definition}>{definition}</Text>

      <View style={styles.modeTabs}>
        <ModeTab
          label="Text"
          active={mode === 'TEXT'}
          onPress={() => setMode('TEXT')}
          disabled={busy}
        />
        <ModeTab
          label="Photo"
          active={mode === 'PHOTO'}
          onPress={() => setMode('PHOTO')}
          disabled={busy}
        />
      </View>

      {mode === 'TEXT' && (
        <View style={styles.section}>
          <Text style={styles.hint}>
            Describe where you saw or heard the word, or paste the sentence itself.
          </Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={4}
            placeholder={`e.g. "I read '${word}' on a poster at the train station."`}
            placeholderTextColor={colors.inkMuted}
            value={text}
            onChangeText={setText}
            editable={!busy}
            accessibilityLabel="Describe where you saw or heard the word"
          />
          <Pressable
            style={[styles.submitButton, (!text.trim() || busy) && styles.submitButtonDisabled]}
            onPress={onSubmitText}
            disabled={!text.trim() || busy}
            accessibilityRole="button"
            accessibilityLabel="Submit"
          >
            {busy ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.submitButtonText}>Submit</Text>
            )}
          </Pressable>
        </View>
      )}

      {mode === 'PHOTO' && (
        <View style={styles.section}>
          <Text style={styles.hint}>
            Take or choose a photo showing the word used somewhere real.
          </Text>

          {photo && <Image source={{ uri: photo.uri }} style={styles.preview} />}

          <View style={styles.photoButtonsRow}>
            <Pressable
              style={styles.photoButton}
              onPress={() => pickPhoto('camera')}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Take Photo"
            >
              <Text style={styles.photoButtonText}>Take Photo</Text>
            </Pressable>
            <Pressable
              style={styles.photoButton}
              onPress={() => pickPhoto('library')}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Choose Photo"
            >
              <Text style={styles.photoButtonText}>Choose Photo</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.submitButton, (!photo || busy) && styles.submitButtonDisabled]}
            onPress={onSubmitPhoto}
            disabled={!photo || busy}
            accessibilityRole="button"
            accessibilityLabel="Submit"
          >
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color={colors.ink} />
                <Text style={styles.submitButtonText}>
                  {stage === 'uploading' ? 'Uploading...' : 'Assessing...'}
                </Text>
              </View>
            ) : (
              <Text style={styles.submitButtonText}>Submit</Text>
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
  active,
  onPress,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.modeTab, active && styles.modeTabActive]}
    >
      <Text style={[styles.modeTabText, active && styles.modeTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
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
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
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
  preview: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.surface },
  photoButtonsRow: { flexDirection: 'row', gap: spacing.sm },
  photoButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
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
