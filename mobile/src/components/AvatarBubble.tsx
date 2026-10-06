import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AvatarImage } from './AvatarImage';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  colors: ThemeColors;
  avatarUrl?: string | null;
  /** Only its first character is used, for the initial-letter fallback
   * shown when there's no avatarUrl — same convention as HomeScreen's
   * own header avatar. */
  username: string;
  /** Diameter in px. Default 36 matches HomeScreen's header avatar. */
  size?: number;
  /** Called when the picture fails to load (e.g. an expired signed link). */
  onLoadError?: () => void;
}

/**
 * Small reusable avatar bubble — an Image when `avatarUrl` is set, else
 * an initial-letter circle (HomeScreen's own fallback pattern, lifted
 * out here since the avatar-tap popup, the leaderboard rows, and the
 * Public Profile screen all need the exact same rendering, 2026-09).
 * Purely presentational — wrap it in a Pressable for tap behavior.
 */
export function AvatarBubble({ colors, avatarUrl, username, size = 36, onLoadError }: Props) {
  const styles = useMemo(() => createStyles(colors, size), [colors, size]);
  const initial = (username.trim()[0] ?? '?').toUpperCase();

  const initialBubble = (
    <View style={styles.bubble}>
      <Text style={styles.initial}>{initial}</Text>
    </View>
  );
  return avatarUrl ? (
    <AvatarImage uri={avatarUrl} style={styles.bubble} fallback={initialBubble} onFail={onLoadError} />
  ) : (
    initialBubble
  );
}

function createStyles(colors: ThemeColors, size: number) {
  return StyleSheet.create({
    bubble: {
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    initial: {
      color: colors.ink,
      fontSize: Math.max(11, Math.round(size * 0.42)),
      fontWeight: '700',
    },
  });
}
