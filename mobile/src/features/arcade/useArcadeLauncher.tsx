import { useCallback, useState, type ReactElement } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';
import { isVersusGame, type VersusGame } from '@/services/arcadeVersus';
import { ArcadeModeSheet } from './ArcadeModeSheet';

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
 * Render `sheet` once anywhere in the screen's tree and call `launch(route)`
 * from the tile's onPress.
 */
export function useArcadeLauncher(): {
  launch: (route: ArcadeRoute) => void;
  sheet: ReactElement;
} {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [pending, setPending] = useState<VersusGame | null>(null);

  const launch = useCallback(
    (route: ArcadeRoute) => {
      const game = ROUTE_TO_GAME[route];
      if (game && isVersusGame(game)) {
        setPending(game);
        return;
      }
      navigation.navigate(route);
    },
    [navigation],
  );

  const close = useCallback(() => setPending(null), []);

  const sheet = (
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
  );

  return { launch, sheet };
}
