import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { getMyPassport, type PassportView } from '@/services/passport';
import { useAuthStore } from '@/state/authStore';
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
  const accessToken = useAuthStore((s) => s.accessToken);
  const [passport, setPassport] = useState<PassportView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    getMyPassport(accessToken)
      .then(setPassport)
      .catch(() => setError('Could not load your Learning Passport.'));
  }, [accessToken]);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
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
        <Text style={styles.name}>{passport.displayName}</Text>
        <Text style={styles.meta}>
          {passport.clan ? passport.clan.name : 'No clan yet'}
          {passport.countryCode ? ` · ${passport.countryCode}` : ''}
        </Text>
      </View>

      <View style={styles.statGrid}>
        <Stat label="Level" value={String(passport.level)} />
        <Stat label="Journey" value={passport.journeyStageName} />
        <Stat label="Words mastered" value={String(passport.wordsMastered)} />
        <Stat label="Longest streak" value={`${passport.longestStreak}d`} />
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Boss Battle history</Text>
        <Text style={styles.sectionBody}>
          {passport.bossBattleHistory.length > 0
            ? `${passport.bossBattleHistory.length} battles fought · ${passport.bossBattleHistory.filter((b) => b.isWinner).length} won`
            : 'None yet — join this week’s battle from Compete.'}
        </Text>
      </View>

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.lg },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.danger, fontSize: typography.scale.md },
  header: { gap: 2 },
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
