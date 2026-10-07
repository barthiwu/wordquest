import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';
import { BackButton } from '@/components/BackButton';
import { GuestUpgradeBanner } from './GuestUpgradeBanner';
import { ApiError } from '@/services/apiClient';
import { VERSUS_GAME_ROUTE, type VersusGame } from '@/services/arcadeVersus';
import {
  createGroup,
  extractGroupCode,
  GROUP_MAX_MEMBERS,
  listMyGroups,
  type GroupSummary,
} from '@/services/arcadeGroups';

type Props = NativeStackScreenProps<RootStackParamList, 'ArcadeGroupHub'>;

const GAMES = Object.keys(VERSUS_GAME_ROUTE) as VersusGame[];
const GAME_TITLE_KEY: Record<VersusGame, string> = {
  SCRAMBLE_QUEST: 'arcade:scrambleQuestTitle',
  COMPLETE_IT: 'arcade:completeItTitle',
  HANGMAN: 'arcade:hangmanTitle',
};

/**
 * The Group Play hub: create a private group (up to 50 players, joined only
 * through its link), open a link or code you were given, or go back into a
 * group you are already in.
 */
export function ArcadeGroupHubScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation(['arcade', 'common']);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isGuest = useAuthStore((s) => s.user?.isGuest === true);

  const [game, setGame] = useState<VersusGame>(route.params?.game ?? 'SCRAMBLE_QUEST');
  const [title, setTitle] = useState('');
  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [mine, setMine] = useState<GroupSummary[] | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Fresh list every time the hub comes into view (coming back from a group).
  useFocusEffect(
    useCallback(() => {
      if (!accessToken) return;
      listMyGroups(accessToken)
        .then((list) => alive.current && setMine(list))
        .catch(() => alive.current && setMine((prev) => prev ?? []));
    }, [accessToken]),
  );

  const create = async () => {
    if (!accessToken || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const group = await createGroup(accessToken, {
        game,
        title: title.trim() || undefined,
        showLeaderboard,
      });
      navigation.navigate('ArcadeGroup', { groupId: group.id });
    } catch (err) {
      if (alive.current) {
        setCreateError(err instanceof ApiError ? err.message : t('arcade:group.createError'));
      }
    } finally {
      if (alive.current) setCreating(false);
    }
  };

  const join = () => {
    const parsed = extractGroupCode(code);
    if (!parsed) {
      setCodeError(true);
      return;
    }
    setCodeError(false);
    navigation.navigate('ArcadeGroup', { code: parsed });
  };

  return (
    <ScrollView style={styles.flexFill} contentContainerStyle={styles.container}>
      <View style={styles.column}>
        {isGuest ? null : <BackButton onPress={() => navigation.goBack()} />}
        <Text style={styles.title} accessibilityRole="header">
          {t('arcade:group.hubTitle')}
        </Text>
        <Text style={styles.sub}>{t('arcade:group.hubSub')}</Text>

        {isGuest ? <GuestUpgradeBanner /> : null}

        {isGuest ? null : (
        <View style={styles.card}>
          <Text style={styles.label}>{t('arcade:group.chooseGame')}</Text>
          <View style={styles.chips}>
            {GAMES.map((g) => (
              <Pressable
                key={g}
                style={[styles.chip, game === g && styles.chipOn]}
                onPress={() => setGame(g)}
                accessibilityRole="button"
                accessibilityState={{ selected: game === g }}
                accessibilityLabel={t(GAME_TITLE_KEY[g])}
              >
                <Text style={[styles.chipText, game === g && styles.chipTextOn]}>
                  {t(GAME_TITLE_KEY[g])}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>{t('arcade:group.titleLabel')}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            maxLength={60}
            placeholder={t('arcade:group.titlePlaceholder')}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t('arcade:group.titleLabel')}
          />

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchTitle}>{t('arcade:group.leaderboardLabel')}</Text>
              <Text style={styles.hint}>
                {showLeaderboard
                  ? t('arcade:group.leaderboardOn')
                  : t('arcade:group.leaderboardOff')}
              </Text>
            </View>
            <Switch
              value={showLeaderboard}
              onValueChange={setShowLeaderboard}
              trackColor={{ false: colors.border, true: colors.arcane }}
              thumbColor={colors.ink}
              accessibilityLabel={t('arcade:group.leaderboardLabel')}
            />
          </View>

          {createError ? <Text style={styles.error}>{createError}</Text> : null}
          <Pressable
            style={[styles.button, creating && styles.disabled]}
            disabled={creating}
            onPress={() => void create()}
            accessibilityRole="button"
            accessibilityLabel={t('arcade:group.create')}
          >
            <Text style={styles.buttonText}>
              {creating ? t('arcade:group.creating') : t('arcade:group.create')}
            </Text>
          </Pressable>
          <Text style={styles.hint}>
            {t('arcade:group.maxPlayers', { max: GROUP_MAX_MEMBERS })}
          </Text>
        </View>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>{t('arcade:group.joinHeading')}</Text>
          <View style={styles.joinRow}>
            <TextInput
              style={[styles.input, styles.joinInput]}
              value={code}
              onChangeText={(v) => {
                setCode(v);
                setCodeError(false);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={t('arcade:group.joinPlaceholder')}
              placeholderTextColor={colors.inkMuted}
              onSubmitEditing={join}
              accessibilityLabel={t('arcade:group.joinHeading')}
            />
            <Pressable
              style={styles.smallButton}
              onPress={join}
              accessibilityRole="button"
              accessibilityLabel={t('arcade:group.joinGo')}
            >
              <Text style={styles.buttonText}>{t('arcade:group.joinGo')}</Text>
            </Pressable>
          </View>
          {codeError ? <Text style={styles.error}>{t('arcade:group.joinBadCode')}</Text> : null}
        </View>

        <Text style={styles.heading}>{t('arcade:group.mineHeading')}</Text>
        {mine === null ? (
          <ActivityIndicator color={colors.arcaneSoft} />
        ) : mine.length === 0 ? (
          <Text style={styles.sub}>{t('arcade:group.mineEmpty')}</Text>
        ) : (
          mine.map((g) => (
            <Pressable
              key={g.id}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => navigation.navigate('ArcadeGroup', { groupId: g.id })}
              accessibilityRole="button"
              accessibilityLabel={g.title ?? t(GAME_TITLE_KEY[g.game])}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {g.title ?? t(GAME_TITLE_KEY[g.game])}
                </Text>
                <Text style={styles.hint} numberOfLines={1}>
                  {t(GAME_TITLE_KEY[g.game])} ·{' '}
                  {t('arcade:group.mineMembers', { count: g.memberCount })}
                  {g.isHost ? ` · ${t('arcade:group.mineHost')}` : ''}
                </Text>
              </View>
              <Text style={[styles.status, g.status === 'ACTIVE' && styles.statusLive]}>
                {t(`arcade:group.status.${g.status}`)}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    flexFill: { flex: 1, backgroundColor: colors.background },
    container: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.lg + topInset },
    column: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: spacing.md },
    title: { color: colors.ink, fontSize: typography.scale.xl, fontWeight: '800' },
    sub: { color: colors.inkMuted, fontSize: typography.scale.md },
    heading: {
      color: colors.ink,
      fontSize: typography.scale.lg,
      fontWeight: '700',
      marginTop: spacing.sm,
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
    },
    label: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    hint: { color: colors.inkMuted, fontSize: typography.scale.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surfaceRaised,
    },
    chipOn: { backgroundColor: colors.arcane, borderColor: colors.arcane },
    chipText: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
    chipTextOn: { color: colors.ink },
    input: {
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      color: colors.ink,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.scale.md,
    },
    joinRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
    joinInput: { flex: 1, minWidth: 0 },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    switchText: { flex: 1, gap: 2 },
    switchTitle: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '600' },
    button: {
      backgroundColor: colors.arcane,
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    smallButton: {
      flexShrink: 0,
      backgroundColor: colors.arcane,
      borderRadius: radius.pill,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
    },
    buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    disabled: { opacity: 0.5 },
    error: { color: colors.danger, fontSize: typography.scale.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    pressed: { opacity: 0.8 },
    rowText: { flex: 1, gap: 2 },
    rowTitle: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    status: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
    statusLive: { color: colors.success },
  });
}
