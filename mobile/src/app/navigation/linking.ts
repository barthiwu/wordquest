import { Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import Constants from 'expo-constants';
import { getPathFromState as getPathFromStateDefault } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './RootNavigator';

/**
 * Deep link routing (Correction & Completion Spec §6: "mobile deep link
 * handling") for the two kinds of URL WordQuest ever hands a player:
 * a tapped push notification (Notification.deepLink, set at every
 * notify() call site — see notification.service.ts/
 * notification-scheduler.service.ts on the backend) and a tapped
 * transactional-email link (EmailService.sendVerificationEmail /
 * sendPasswordResetEmail). Both use the same `wordquest://` custom
 * scheme (app.json's `scheme`), so one linking config handles both.
 *
 * `ExpoLinking.createURL('/')` is included alongside the bare scheme so
 * the same paths also resolve while running inside Expo Go during
 * development, where the app is actually addressed as
 * `exp://<host>/--/...` rather than `wordquest://...` — a standalone/
 * production build only ever sees the second prefix.
 *
 * --- The web subpath problem (found + fixed 2026-09-29) ---
 * The GitHub Pages web build is deployed under a subpath, not the
 * domain root (app.json's `experiments.baseUrl`, currently
 * "/wordquest" — see scripts/inject-spa-fallback.js's own comment for
 * the *server-side* half of this same problem). `ExpoLinking.
 * createURL('/')` on web resolves to plain `window.location.origin +
 * '/'`, with no idea that subpath exists. Left uncorrected, that broke
 * two separate things, both confirmed live in a browser before this
 * fix:
 *   1. INCOMING: an opened deep link (a verify-email link, a
 *      reset-password link) never matched any configured screen — the
 *      extra "wordquest/" path segment never lined up — so React
 *      Navigation silently fell back to the default route instead of
 *      routing to VerifyEmail/ResetPassword.
 *   2. OUTGOING: React Navigation's `prefixes` array is only consulted
 *      when matching an INCOMING url; it is never re-applied when
 *      WRITING one back to the browser's address bar. So every
 *      in-app navigation left the address bar pointing at a
 *      root-relative URL with no /wordquest segment at all (e.g.
 *      landing on Welcome rewrote the bar to plain "/Welcome") —
 *      which then 404s on the very next refresh.
 * Fixed by (1) adding the real origin+baseUrl as a prefix, ahead of
 * the origin-only one, so incoming URLs match correctly, and (2)
 * wrapping the default `getPathFromState` to prepend that same
 * baseUrl onto every outgoing path, since React Navigation won't do
 * that on its own. Native platforms and Expo Go are unaffected by
 * either change — `experiments.baseUrl` is a web-only concept.
 */
const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
const webBaseUrl = isWeb ? (Constants.expoConfig?.experiments?.baseUrl ?? '') : '';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    ...(isWeb ? [`${window.location.origin}${webBaseUrl}`] : []),
    ExpoLinking.createURL('/'),
    'wordquest://',
  ],
  config: {
    screens: {
      VerifyEmail: 'verify-email',
      ResetPassword: 'reset-password',
      DailyQuest: 'daily-quest/:questKey',
      Achievements: 'achievements',
      BossBattle: 'boss-battle',
      BossBattleLeaderboard: 'boss-battle-leaderboard',
      SkillRadar: 'skill-radar',
      Notifications: 'notifications',
      CalibrationResult: 'calibration-result',
      CatchUpCalendar: 'catch-up',
      Main: {
        screens: {
          Home: 'home',
          Play: 'play',
          Journey: 'journey',
          Compete: 'compete',
          Profile: 'profile',
        },
      },
      // Everything else (Splash, Welcome, Registration, Login, ...)
      // simply isn't reachable by URL — there's no notification or
      // email that would ever want to open the app straight to them,
      // and leaving them unlisted is what keeps that true rather than
      // documenting an intent by omission alone.
    },
  },
  ...(webBaseUrl
    ? {
        getPathFromState: (state, options) =>
          `${webBaseUrl}${getPathFromStateDefault(state, options)}`,
      }
    : {}),
};
