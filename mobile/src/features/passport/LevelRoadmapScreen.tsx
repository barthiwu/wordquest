import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { LEVEL_ROADMAP, type LevelRoadmapEntry } from '@/constants/levels';
import { GlyphCoin } from '@/components/GlyphIcon';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'LevelRoadmap'>;

/**
 * The full 100-level ladder (Final Core Progression Specification
 * §3.2/§3.4) — requested off the Passport/Home "Level" stat: "should
 * be clickable, and show all other levels (even if they're not there
 * yet)." Every level renders, reached or not; only the XP-to-go and
 * the lock state differ once you're past the player's current level.
 */
export function LevelRoadmapScreen({ route, navigation }: Props) {
  const { currentLevel, totalXp } = route.params;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);

  return (
    <View style={styles.container}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Levels</Text>
      <Text style={styles.subtitle}>
        Level {currentLevel} · {totalXp.toLocaleString()} XP
      </Text>

      <FlatList
        data={LEVEL_ROADMAP}
        keyExtractor={(item) => String(item.level)}
        contentContainerStyle={styles.list}
        initialScrollIndex={Math.max(0, currentLevel - 3)}
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        renderItem={({ item }) => (
          <RoadmapRow item={item} currentLevel={currentLevel} totalXp={totalXp} styles={styles} colors={colors} />
        )}
      />
    </View>
  );
}

const ROW_HEIGHT = 64;

function RoadmapRow({
  item,
  currentLevel,
  totalXp,
  styles,
  colors,
}: {
  item: LevelRoadmapEntry;
  currentLevel: number;
  totalXp: number;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  const isCurrent = item.level === currentLevel;
  const isReached = item.level <= currentLevel;
  const nextThreshold = LEVEL_ROADMAP[item.level]?.xpRequired ?? null;
  const xpToGo = !isReached ? Math.max(0, item.xpRequired - totalXp) : null;

  return (
    <View style={[styles.row, isCurrent && styles.rowCurrent, { height: ROW_HEIGHT }]}>
      <View style={styles.rowLeft}>
        <Text style={[styles.rowLevel, !isReached && styles.rowLevelLocked]}>Lv {item.level}</Text>
        <View>
          <Text style={[styles.rowXp, !isReached && styles.rowTextLocked]}>
            {item.xpRequired.toLocaleString()} XP
          </Text>
          {isCurrent && nextThreshold != null ? (
            <Text style={styles.rowMeta}>
              {Math.max(0, nextThreshold - totalXp).toLocaleString()} XP to Level {item.level + 1}
            </Text>
          ) : xpToGo != null ? (
            <Text style={styles.rowMeta}>{xpToGo.toLocaleString()} XP to go</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.rowRight}>
        {item.glyphReward > 0 && (
          <View style={styles.glyphReward}>
            <GlyphCoin size={16} />
            <Text style={[styles.rowGlyphs, !isReached && styles.rowTextLocked]}>
              {item.glyphReward}
            </Text>
          </View>
        )}
        {isCurrent ? (
          <Text style={styles.currentBadge}>Current</Text>
        ) : !isReached ? (
          <Text style={styles.lockedBadge}>Locked</Text>
        ) : (
          <Text style={styles.reachedBadge}>✓</Text>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingTop: topInset + spacing.xl,
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
      marginTop: spacing.md,
    },
    subtitle: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      marginTop: spacing.xs,
      marginBottom: spacing.md,
    },
    list: {
      paddingBottom: spacing.xl,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.xs,
    },
    rowCurrent: {
      borderColor: colors.arcaneSoft,
      borderWidth: 2,
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    rowLevel: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.md,
      fontWeight: '700',
      width: 56,
    },
    rowLevelLocked: {
      color: colors.inkMuted,
    },
    rowXp: {
      color: colors.ink,
      fontSize: typography.scale.sm,
      fontWeight: '600',
    },
    rowMeta: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      marginTop: 2,
    },
    rowTextLocked: {
      color: colors.inkMuted,
    },
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    glyphReward: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    rowGlyphs: {
      color: colors.glyph,
      fontSize: typography.scale.sm,
      fontWeight: '700',
    },
    currentBadge: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    lockedBadge: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
    },
    reachedBadge: {
      color: colors.success,
      fontSize: typography.scale.md,
      fontWeight: '700',
    },
  });
}
