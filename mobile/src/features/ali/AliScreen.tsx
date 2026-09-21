import { useCallback, useState, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { getMyAliMessages, type AliMessage } from '@/services/ali';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import { AliMark } from '@/components/AliMark';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Ali'>;

/**
 * Screen 44 of the UI/UX Screen Bible — "Basic ALI" from the MVP list.
 * ALI is reactive, not conversational (spec §4.1): this is a feed of
 * what ALI has already said in response to real events, not a chat the
 * player composes into. Empty state reads as "ALI's still getting to
 * know you" rather than an error, since a brand-new player genuinely
 * has no events yet.
 */
export function AliScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [messages, setMessages] = useState<AliMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getMyAliMessages(accessToken)
      .then(setMessages)
      .catch(() => setError('Could not reach ALI right now.'));
  }, [accessToken]);

  useFocusEffect(load);

  if (error) {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!messages) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>ALI</Text>
      <Text style={styles.subtitle}>
        Your learning companion’s reactions to what you’ve done so far.
      </Text>

      {messages.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            ALI is still getting to know you — keep questing, and ALI will start reacting here.
          </Text>
        </View>
      )}

      {messages.map((message, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.avatar}>
              <AliMark size={13} />
            </View>
            <Text style={styles.cardName}>ALI</Text>
          </View>
          <Text style={styles.cardText}>{message.text}</Text>
          {message.recommendation && (
            <Text style={styles.recommendation}>{message.recommendation}</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: topInset + spacing.xxl, gap: spacing.md },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.danger, fontSize: typography.scale.md },
  title: {
    color: colors.ink,
    fontSize: typography.scale.xl,
    fontWeight: typography.display.weight,
  },
  subtitle: { color: colors.inkMuted, fontSize: typography.scale.sm },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  emptyText: { color: colors.inkMuted, fontSize: typography.scale.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.arcaneSoft,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.arcaneSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    color: colors.arcaneSoft,
    fontSize: typography.scale.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardText: { color: colors.ink, fontSize: typography.scale.md },
  recommendation: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '700' },
});
}
