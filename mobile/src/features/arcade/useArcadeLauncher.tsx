import { useCallback, useState, type ReactElement } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';
import { isVersusGame, type VersusGame } from '@/services/arcadeVersus';
import type { ArcadeGameKind } from '@/services/arcadeStatus';
import { playsBadge } from '@/services/arcadePlays';
import { useArcadePlaysStore } from '@/state/arcadePlaysStore';
import { useAuthStore } from '@/state/authStore';
import { ArcadeModeSheet } from './ArcadeModeSheet';
import { ArcadeLockedSheet } from './ArcadeLockedSheet';
import { ARCADE_ROUTE_GAME } from './gameTitles';

type ArcadeRoute = 'ScrambleQuest' | 'WordDuel' | 'CompleteIt' | 'Hangman' | 'BossBattle';

const ROUTE_TO_GAME: Partial<Record<ArcadeRoute, VersusGame>> = {
  ScrambleQuest: 'SCRAMBLE_QUEST',
  CompleteIt: 'COMPLETE_IT',
  Hangman: 'HANGMAN',
};

const GAME_TO_ROUTE: Record<VersusGame, 'ScrambleQuest' | 'CompleteIt' | 'Hangman'> = {
  SCRAMBLE_QUEST: 'ScrambleQuest',
  COMPLETE_IT: 'CompleteIt',
  HANGMAN: 'Hangman',
};

/**
 * One place that decides what tapping an Arcade tile does. Word Duel and
 * Boss Battle open straight away; ScrambleQuest, Complete It and Hangman
 * first ask "single player or multiplayer?" with a banner. Every screen that
 * lists Arcade games uses this, so the choice behaves identically on the
 * Home screen, the Play hub and the prototype look.
 *
 * It also enforces the free plan's daily cap on the client: a game whose
 * plays for today are used opens the "locked until tomorrow" sheet instead
 * (the server enforces the same cap, this just saves the round trip), and
 * `badge(route)` gives the "N left" / "Locked" text for the tile.
 *
 * Render `sheet` once anywhere in the screen's tree and call `launch(route)`
 * from the tile's onPress.
 */
export function useArcadeLauncher(): {
  launch: (route: ArcadeRoute) => void;
  /** "7 left today" / "Locked today" for a tile; null on WordQuest+ or before it loads. */
  badge: (route: ArcadeRoute) => { text: string; locked: boolean } | null;
  sheet: ReactElement;
} {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useTranslation('arcade');
  const accessToken = useAuthStore((s) => s.accessToken);
  const allowance = useArcadePlaysStore((s) => s.allowance);
  const refresh = useArcadePlaysStore((s) => s.refresh);
  const [pending, setPending] = useState<VersusGame | null>(null);
  const [locked, setLocked] = useState<ArcadeGameKind | null>(null);

  // Fresh numbers every time the screen with the tiles comes into view
  // (coming back from a game is exactly when they change).
  useFocusEffect(
    useCallback(() => {
      if (accessToken) void refresh(accessToken);
    }, [accessToken, refresh]),
  );

  const badge = useCallback(
    (route: ArcadeRoute): { text: string; locked: boolean } | null => {
      const game = ARCADE_ROUTE_GAME[route as keyof typeof ARCADE_ROUTE_GAME];
      if (!game) return null;
      const b = playsBadge(allowance, game);
      if (!b) return null;
      return b.kind === 'locked'
        ? { text: t('plays.locked'), locked: true }
        : { text: t('plays.left', { count: b.left }), locked: false };
    },
    [allowance, t],
  );

  const launch = useCallback(
    (route: ArcadeRoute) => {
      const kind = ARCADE_ROUTE_GAME[route as keyof typeof ARCADE_ROUTE_GAME];
      if (kind && playsBadge(allowance, kind)?.kind === 'locked') {
        setLocked(kind);
        return;
      }
      const game = ROUTE_TO_GAME[route];
      if (game && isVersusGame(game)) {
        setPending(game);
        return;
      }
      navigation.navigate(route);
    },
    [navigation, allowance],
  );

  const close = useCallback(() => setPending(null), []);

  const sheet = (
    <>
      <ArcadeLockedSheet game={locked} onClose={() => setLocked(null)} />
      <ArcadeModeSheet
        game={pending}
        onClose={close}
        onSingle={(game) => {
          setPending(null);
          navigation.navigate(GAME_TO_ROUTE[game], {});
        }}
        onRandom={(game) => {
          setPending(null);
          navigation.navigate('ArcadeVersus', { game });
        }}
        onFriend={(game) => {
          setPending(null);
          navigation.navigate('Friends', { challengeGame: game });
        }}
      />
    </>
  );

  return { launch, badge, sheet };
}
