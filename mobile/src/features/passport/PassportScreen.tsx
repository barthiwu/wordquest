import { useCallback, useState, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { getMyPassport, type PassportView } from '@/services/passport';
import {
  confirmAvatar,
  createAvatarUploadTarget,
  deleteAvatar,
  uploadAvatarBytes,
  type AvatarContentType,
} from '@/services/users';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { countryCodeToFlagEmoji } from '@/utils/countryFlag';
import { countryNameForCode } from '@/constants/countries';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '@/app/navigation/MainTabNavigator';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Profile'>,
  NativeStackScreenProps<RootStackParamList>
>;

/**
 * Screen 28 of the UI/UX Screen Bible, now the Profile tab — reads like
 * a credential, not another settings page (§28). Achievements and Boss
 * Battle history summarize here and open into their own screens for
 * detail; Order and Settings live here too, since Profile is where a
 * player's identity and account both naturally belong.
 */
export function PassportScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [passport, setPassport] = useState<PassportView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const load = useCallback(() => {
    if (!accessToken) return;
    setError(null);
    getMyPassport(accessToken)
      .then(setPassport)
      .catch(() => setError('Could not load your Learning Passport.'));
  }, [accessToken]);

  // Refetch every time the Profile tab regains focus (matching Home),
  // so an earlier failure -- e.g. the backend still coming up -- clears
  // itself on the next visit instead of sticking until the app reloads.
  useFocusEffect(load);

  const pickAndUploadAvatar = async (source: 'camera' | 'library') => {
    if (!accessToken) return;
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        `WordQuest needs ${source === 'camera' ? 'camera' : 'photo library'} access to set a profile picture.`,
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
    const contentType: AvatarContentType = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';

    setAvatarBusy(true);
    try {
      const target = await createAvatarUploadTarget(accessToken, contentType);
      await uploadAvatarBytes(target.uploadUrl, asset.uri, contentType);
      const confirmed = await confirmAvatar(accessToken, target.key);
      setPassport((prev) => (prev ? { ...prev, avatarUrl: confirmed.avatarUrl } : prev));
    } catch (err) {
      Alert.alert(
        'Could not set profile picture',
        err instanceof ApiError ? err.message : 'Please try again.',
      );
    } finally {
      setAvatarBusy(false);
    }
  };

  const onRemoveAvatar = async () => {
    if (!accessToken) return;
    setAvatarBusy(true);
    try {
      const result = await deleteAvatar(accessToken);
      setPassport((prev) => (prev ? { ...prev, avatarUrl: result.avatarUrl } : prev));
    } catch {
      Alert.alert('Could not remove your profile picture', 'Please try again.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const onAvatarPress = () => {
    const options: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
      { text: 'Take photo', onPress: () => pickAndUploadAvatar('camera') },
      { text: 'Choose from library', onPress: () => pickAndUploadAvatar('library') },
    ];
    if (passport?.avatarUrl) {
      options.push({ text: 'Remove photo', style: 'destructive', onPress: onRemoveAvatar });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Profile picture', undefined, options);
  };

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel="Retry"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!passport) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable
          style={styles.avatarWrapper}
          onPress={onAvatarPress}
          disabled={avatarBusy}
          accessibilityRole="button"
          accessibilityLabel="Change profile picture"
        >
          {passport.avatarUrl ? (
            <Image source={{ uri: passport.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {passport.displayName?.trim().charAt(0).toUpperCase() || '?'}
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
        <View style={styles.headerText}>
          <Text style={styles.name}>{passport.displayName}</Text>
          <Text style={styles.meta}>
            {passport.clan ? passport.clan.name : 'No clan yet'}
            {passport.countryCode
              ? ` · ${countryCodeToFlagEmoji(passport.countryCode) ?? ''} ${
                  countryNameForCode(passport.countryCode) ?? passport.countryCode
                }`
              : ''}
          </Text>
        </View>
      </View>

      <View style={styles.statGrid}>
        <Stat
          label="Level"
          value={String(passport.level)}
          onPress={() =>
            navigation.navigate('LevelRoadmap', { currentLevel: passport.level, totalXp: passport.totalXp })
          }
          styles={styles}
        />
        <Stat label="Journey" value={passport.journeyStageName} styles={styles} />
        <Stat
          label="Words mastered"
          value={String(passport.wordsMastered)}
          onPress={() => navigation.navigate('WordMastery')}
          styles={styles}
        />
        <Stat label="Longest streak" value={`${passport.longestStreak}d`} styles={styles} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CEFR</Text>
        <Text style={styles.sectionBody}>
          {passport.cefrUnlocked
            ? `Unlocked${passport.estimatedCefrLevel ? ` — estimated ${passport.estimatedCefrLevel}` : ''}`
            : 'Not yet unlocked'}
        </Text>
        {/* V22 §8 finding: confidence was computed server-side but never
            shown anywhere — surfaced here as a rounded percentage next
            to the estimate it backs. */}
        {passport.estimatedCefrConfidence != null && (
          <Text style={styles.sectionMeta}>
            {Math.round(passport.estimatedCefrConfidence * 100)}% confidence
          </Text>
        )}
      </View>

      <Pressable
        style={styles.section}
        onPress={() => navigation.navigate('Achievements')}
        accessibilityRole="button"
        accessibilityLabel="Achievements"
      >
        <Text style={styles.sectionTitle}>Achievements</Text>
        <Text style={styles.sectionBody}>
          {passport.achievements.length > 0
            ? passport.achievements.map((a) => a.name).join(', ')
            : 'None yet — tap to see the full catalog.'}
        </Text>
      </Pressable>


      <Pressable
        style={styles.section}
        onPress={() => navigation.navigate('BossBattle')}
        accessibilityRole="button"
        accessibilityLabel="Boss Battle history"
      >
        <Text style={styles.sectionTitle}>Boss Battle history</Text>
        <Text style={styles.sectionBody}>
          {passport.bossBattleHistory.length > 0
            ? `${passport.bossBattleHistory.length} battles fought · ${passport.bossBattleHistory.filter((b) => b.isWinner).length} won`
            : 'None yet — join this week’s battle from Compete.'}
        </Text>
      </Pressable>

      <Pressable
        style={styles.section}
        onPress={() => navigation.navigate('QuestCardGallery')}
        accessibilityRole="button"
        accessibilityLabel="Quest Cards"
      >
        <Text style={styles.sectionTitle}>Quest Cards</Text>
        {/* V22 §7/§9 finding: the showcase endpoints worked but this
            section only ever showed a static teaser — now renders the
            player's actual showcased cards, set from the gallery. */}
        {passport.showcasedCards.length > 0 ? (
          <View style={styles.showcaseRow}>
            {passport.showcasedCards.map((c) => (
              <View key={c.id} style={styles.showcaseChip}>
                <Text style={styles.showcaseChipRarity}>{c.rarity}</Text>
                <Text style={styles.showcaseChipTitle} numberOfLines={1}>
                  {c.title}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.sectionBody}>
            Your collected identity cards — tap to view them all.
          </Text>
        )}
      </Pressable>

      <Pressable
        style={styles.section}
        onPress={() => navigation.navigate('Order')}
        accessibilityRole="button"
        accessibilityLabel="The Order"
      >
        <Text style={styles.sectionTitle}>The Order</Text>
        <Text style={styles.sectionBody}>
          {passport.order ? passport.order.name : 'Declare your Order once you reach Kingdom.'}
        </Text>
      </Pressable>

      <Pressable
        style={styles.section}
        onPress={() => navigation.navigate('Shop')}
        accessibilityRole="button"
        accessibilityLabel="Shop"
      >
        <Text style={styles.sectionTitle}>Shop</Text>
        <Text style={styles.sectionBody}>Spend Glyphs on ALI outfits and accessories.</Text>
      </Pressable>

      <Pressable
        style={styles.section}
        onPress={() => navigation.navigate('Notifications')}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
      >
        <Text style={styles.sectionTitle}>Notifications</Text>
        <Text style={styles.sectionBody}>Your inbox and reminder preferences.</Text>
      </Pressable>

      <Pressable
        style={styles.section}
        onPress={() => navigation.navigate('Settings')}
        accessibilityRole="button"
        accessibilityLabel="Settings"
      >
        <Text style={styles.sectionTitle}>Settings</Text>
        <Text style={styles.sectionBody}>Account, verification, and session</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({
  label,
  value,
  styles,
  onPress,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={styles.stat}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.stat}>{content}</View>;
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: topInset + spacing.xxl, gap: spacing.lg },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.danger, fontSize: typography.scale.md },
  retryButton: {
    marginTop: spacing.md,
    backgroundColor: colors.arcane,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  retryButtonText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { gap: 2, flex: 1 },
  avatarWrapper: { position: 'relative' },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceRaised,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: colors.inkMuted,
    fontSize: typography.scale.lg,
    fontWeight: typography.display.weight,
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.arcane,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  name: { color: colors.ink, fontSize: typography.scale.xl, fontWeight: typography.display.weight },
  meta: { color: colors.inkMuted, fontSize: typography.scale.sm },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: {
    flexBasis: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  statValue: {
    color: colors.ink,
    fontSize: typography.scale.lg,
    fontWeight: typography.display.weight,
  },
  statLabel: { color: colors.inkMuted, fontSize: typography.scale.xs },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  sectionTitle: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
  sectionBody: { color: colors.inkMuted, fontSize: typography.scale.sm },
  sectionMeta: { color: colors.arcaneSoft, fontSize: typography.scale.xs },
  showcaseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  showcaseChip: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    maxWidth: 140,
  },
  showcaseChipRarity: {
    color: colors.arcaneSoft,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  showcaseChipTitle: { color: colors.ink, fontSize: typography.scale.xs },
});
}
