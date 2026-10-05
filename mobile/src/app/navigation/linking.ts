import { Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import Constants from 'expo-constants';
import {
  getPathFromState as getPathFromStateDefault,
  getStateFromPath as getStateFromPathDefault,
} from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './RootNavigator';

/**
 * Deep link routing (Correction & Completion Spec §6: "mobile deep link
 * handling") for the two kinds of URL WordQuest ever hands a player:
 * a tapped push notification (Notification.deepLink, set at every
 * notify() call site — see notification.service.ts/
 * notification-scheduler.service.ts on the backend) and a tapped
 * transactional-email link (EmailService.sendVerificationEmail/
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
 *      reset-password link) never matched any configured screen. The
 *      `prefixes` array below is NOT what's consulted here — on web,
 *      React Navigation's `useLinking` hook (the plain, non-native
 *      implementation used on web) builds its initial path directly
 *      from `window.location.pathname + window.location.search` and
 *      hands that straight to `getStateFromPath`, bypassing
 *      `prefixes`/`Linking.parse()` matching entirely (that codepath
 *      is native-only). So the raw path handed to `getStateFromPath`
 *      still had the leading "/wordquest" segment on it (e.g.
 *      "/wordquest/verify-email?token=..."), which doesn't match any
 *      configured screen path ("verify-email"), so resolution failed
 *      (returned `undefined`). With no resolved initial state, React
 *      Navigation falls back to the Stack's default
 *      `initialRouteName="Splash"`, and SplashScreen's unconditional
 *      `navigation.replace('Main' | 'Welcome')` then discards the
 *      deep link's token entirely — confirmed via
 *      `getStateFromPath('/wordquest/verify-email?token=test123',
 *      config)` returning `undefined` while the same call without the
 *      "/wordquest" prefix resolves correctly to VerifyEmail. This hit
 *      every screen in `config.screens` below, not just verify-email.
 *   2. OUTGOING: React Navigation's `prefixes` array is only consulted
 *      when matching an INCOMING url; it is never re-applied when
 *      WRITING one back to the browser's address bar. So every
 *      in-app navigation left the address bar pointing at a
 *      root-relative URL with no /wordquest segment at all (e.g.
 *      landing on Welcome rewrote the bar to plain "/Welcome") —
 *      which then 404s on the very next refresh.
 * Fixed by (1) wrapping the default `getStateFromPath` to strip
 * `webBaseUrl` off the incoming path before delegating to it, since
 * nothing does that for us on web, and (2) wrapping the default
 * `getPathFromState` to prepend that same baseUrl onto every outgoing
 * path, since React Navigation won't do that on its own either.
 * `prefixes` still matters for native (and Expo Go), where
 * `Linking.parse()` *does* use it to strip the scheme/host before
 * matching — it's just inert for this particular web problem. Native
 * platforms and Expo Go are unaffected by either change —
 * `experiments.baseUrl` is a web-only concept.
 *
 * A resolved deep link (e.g. straight to VerifyEmail) intentionally
 * bypasses Splash the same way React Navigation deep linking always
 * works — the matched screen becomes the sole initial route. That
 * skips Splash's `hydrate()` call for that launch, which matters
 * because some deep-linked screens (VerifyEmail's "Continue" button)
 * read `accessToken` from the auth store. RootNavigator.tsx kicks off
 * that same hydration unconditionally on mount (see its comment) so
 * the store is populated regardless of which screen the deep link
 * lands on, instead of teaching every deep-linkable screen (or this
 * config) about an auth gate.
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
      AliGallery: 'ali-gallery',
      // Public legal pages (Facebook / store listings link to these).
      PrivacyPolicy: 'privacy-policy',
      TermsOfService: 'terms',
      DataDeletion: 'data-deletion',
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
        // See "The web subpath problem" above — on web, the path handed
        // to us here is the raw `location.pathname + location.search`
        // (e.g. "/wordquest/verify-email?token=..."), never stripped of
        // the GH Pages subpath. Strip it ourselves before delegating to
        // the default resolver, or every deep link fails to match and
        // silently falls back to Splash -> Welcome/Main, discarding
        // whatever the link pointed at.
        getStateFromPath: (path, options) => {
          const strippedPath = path.startsWith(webBaseUrl)
            ? path.slice(webBaseUrl.length) || '/'
            : path;
          return getStateFromPathDefault(strippedPath, options);
        },
        getPathFromState: (state, options) =>
          `${webBaseUrl}${getPathFromStateDefault(state, options)}`,
      }
    : {}),
};
