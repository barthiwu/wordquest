import * as ExpoLinking from 'expo-linking';
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
 * Only screens that are genuine deep-link destinations (an actual
 * notify()/email call site's target, or a natural landing spot for one)
 * are listed — this is a routing table for real entry points, not an
 * exhaustive mirror of every screen in RootNavigator.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [ExpoLinking.createURL('/'), 'wordquest://'],
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
      Main: {
        screens: {
          Home: 'home',
          Quest: 'quest',
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
};
