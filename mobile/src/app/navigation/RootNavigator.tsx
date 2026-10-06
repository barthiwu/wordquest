import { useEffect } from 'react';
import {
  NavigationContainer,
  useNavigationContainerRef,
  type NavigatorScreenParams,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useThemeColors, useThemeStore } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { useTokenStore } from '@/state/tokenStore';
import { withResponsiveFrame as framed } from '@/components/layout/withResponsiveFrame';
import { SplashScreen } from '@/features/splash/SplashScreen';
import { WelcomeScreen } from '@/features/welcome/WelcomeScreen';
import { RegistrationScreen } from '@/features/auth/RegistrationScreen';
import { TwoFactorSettingsScreen } from '@/features/settings/TwoFactorSettingsScreen';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { ForgotPasswordScreen } from '@/features/auth/ForgotPasswordScreen';
import { RecoverAccountScreen } from '@/features/auth/RecoverAccountScreen';
import { VerifyEmailScreen } from '@/features/auth/VerifyEmailScreen';
import { ResetPasswordScreen } from '@/features/auth/ResetPasswordScreen';
import { BiodataScreen } from '@/features/onboarding/BiodataScreen';
import { OnboardingGoalScreen } from '@/features/onboarding/OnboardingGoalScreen';
import { ClanSelectionScreen } from '@/features/clans/ClanSelectionScreen';
import { AppIntroScreen } from '@/features/onboarding/AppIntroScreen';
import { MainTabNavigator, type MainTabParamList } from './MainTabNavigator';
import { DailyQuestScreen } from '@/features/quests/DailyQuestScreen';
import { QuestCompleteScreen } from '@/features/quests/QuestCompleteScreen';
import { CatchUpCalendarScreen } from '@/features/quests/CatchUpCalendarScreen';
import { CatchUpReplayScreen } from '@/features/quests/CatchUpReplayScreen';
import { SkillRadarScreen } from '@/features/skills/SkillRadarScreen';
import { FEATURES } from '@/config/features';
import { WordInTheWildScreen } from '@/features/word-in-the-wild/WordInTheWildScreen';
import { SubmitEvidenceScreen } from '@/features/word-in-the-wild/SubmitEvidenceScreen';
import { EvidenceResultScreen } from '@/features/word-in-the-wild/EvidenceResultScreen';
import { AchievementsScreen } from '@/features/achievements/AchievementsScreen';
import { AliScreen } from '@/features/ali/AliScreen';
import { AliGalleryScreen } from '@/features/ali/AliGalleryScreen';
import { BossBattleScreen } from '@/features/boss-battle/BossBattleScreen';
import { ScrambleQuestScreen } from '@/features/arcade/ScrambleQuestScreen';
import { CompleteItScreen } from '@/features/arcade/CompleteItScreen';
import { HangmanScreen } from '@/features/arcade/HangmanScreen';
import { WordDuelScreen } from '@/features/arcade/WordDuelScreen';
import { BossBattleLeaderboardScreen } from '@/features/boss-battle/BossBattleLeaderboardScreen';
import { MasterChallengeScreen } from '@/features/master-challenge/MasterChallengeScreen';
import { OrderScreen } from '@/features/order/OrderScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { ProfileSettingsScreen } from '@/features/settings/ProfileSettingsScreen';
import { ShopScreen } from '@/features/shop/ShopScreen';
import { NotificationsScreen } from '@/features/notifications/NotificationsScreen';
import { CalibrationResultScreen } from '@/features/learning-profile/CalibrationResultScreen';
import { QuestCardGalleryScreen } from '@/features/quest-cards/QuestCardGalleryScreen';
import { QuestCardDetailScreen } from '@/features/quest-cards/QuestCardDetailScreen';
import { WordMasteryScreen } from '@/features/passport/WordMasteryScreen';
import { WordPracticeScreen } from '@/features/passport/WordPracticeScreen';
import { LevelRoadmapScreen } from '@/features/passport/LevelRoadmapScreen';
import { PrivacyPolicyScreen } from '@/features/legal/PrivacyPolicyScreen';
import { TermsOfServiceScreen } from '@/features/legal/TermsOfServiceScreen';
import { DataDeletionScreen } from '@/features/legal/DataDeletionScreen';
import { AgeRestrictionScreen } from '@/features/legal/AgeRestrictionScreen';
import { LanguageScreen } from '@/features/settings/LanguageScreen';
import { AboutScreen } from '@/features/settings/AboutScreen';
import { SendFeedbackScreen } from '@/features/settings/SendFeedbackScreen';
import { AdminDashboardScreen } from '@/features/admin/AdminDashboardScreen';
import { FriendsScreen } from '@/features/friends/FriendsScreen';
import { PublicProfileScreen } from '@/features/friends/PublicProfileScreen';
import type { WordCompletionResult } from '@/services/quests';
import type { Submission } from '@/services/word-in-the-wild';
import { linking } from './linking';

/**
 * Root navigation shell. Pre-auth/onboarding stays a flat stack; once a
 * player reaches "Main" it's the five-tab structure (Home/Quest/Journey/
 * Compete/Profile) from MainTabNavigator. DailyQuest, QuestComplete,
 * SkillRadar, the Word in the Wild flow, and every feature added after
 * (Achievements, ALI, Boss Battle, Master Challenge, Order, Settings)
 * are all pushed ON TOP of the tabs rather than living inside them — an
 * immersive quiz, a drill-down detail screen, or a multi-step flow with
 * a tab bar still visible underneath reads as a mistake, not a feature.
 */
export type RootStackParamList = {
  Splash: undefined;
  Welcome: undefined;
  Registration: undefined;
  Login: undefined;
  ForgotPassword: undefined;
  RecoverAccount: undefined;
  // Params are optional: a deep link that fails to carry a token (a
  // malformed or truncated URL) still lands here rather than crashing
  // navigation — the screens themselves handle a missing token.
  VerifyEmail: { token?: string } | undefined;
  ResetPassword: { token?: string } | undefined;
  Biodata: undefined;
  OnboardingGoal: undefined;
  /** fromHome: joining a clan later from Home, not during onboarding (returns to Home after). */
  ClanSelection: { fromHome?: boolean } | undefined;
  AppIntro: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  DailyQuest: { questKey: string };
  QuestComplete: WordCompletionResult;
  CatchUpCalendar: undefined;
  CatchUpReplay: { localDate: string };
  SkillRadar: undefined;
  WordInTheWild: undefined;
  SubmitEvidence: { missionId: string; word: string; definition: string };
  EvidenceResult: Submission;
  Achievements: undefined;
  Ali: undefined;
  AliGallery: undefined;
  BossBattle: undefined;
  ScrambleQuest: undefined;
  WordDuel: undefined;
  CompleteIt: undefined;
  Hangman: undefined;
  BossBattleLeaderboard: undefined;
  MasterChallenge: undefined;
  Order: undefined;
  Settings: undefined;
  ProfileSettings: undefined;
  Shop: undefined;
  Notifications: undefined;
  CalibrationResult: undefined;
  QuestCardGallery: undefined;
  QuestCardDetail: { id: string };
  WordMastery: undefined;
  WordPractice: { wordId: string };
  LevelRoadmap: { currentLevel: number; totalXp: number };
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  DataDeletion: undefined;
  AgeRestriction: undefined;
  Language: undefined;
  About: undefined;
  TwoFactor: undefined;
  SendFeedback: undefined;
  AdminDashboard: undefined;
  Friends: undefined;
  PublicProfile: { userId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Screens that work without a session; a session ending here doesn't redirect. */
const SIGNED_OUT_ROUTES = new Set<string>([
  'Splash',
  'Welcome',
  'Registration',
  'Login',
  'ForgotPassword',
  'RecoverAccount',
  'VerifyEmail',
  'ResetPassword',
  'PrivacyPolicy',
  'TermsOfService',
  'AgeRestriction',
  'DataDeletion',
]);

export function RootNavigator() {
  const colors = useThemeColors();
  const mode = useThemeStore((s) => s.mode);
  const hydrate = useAuthStore((s) => s.hydrate);

  // Kick off session hydration unconditionally, independent of which
  // screen ends up as the initial route. Normally that's Splash, which
  // already awaits hydrate() itself before deciding Main vs Welcome --
  // but a resolved deep link (VerifyEmail, ResetPassword, DailyQuest,
  // ...) bypasses Splash entirely, the same way React Navigation deep
  // linking always works: the matched screen becomes the sole initial
  // route, so Splash's effect never runs for that launch. Without this,
  // a deep-linked screen that reads auth state (e.g. VerifyEmailScreen's
  // "Continue" button checking `accessToken`) would see the store's
  // pre-hydration defaults for the entire session. authStore.hydrate()
  // is idempotent (returns the same in-flight/settled promise on repeat
  // calls), so this and Splash's own call never duplicate the work --
  // whichever fires first wins, and every `useAuthStore` selector
  // downstream (accessToken, isHydrated, user) re-renders reactively
  // once it resolves, regardless of which screen is mounted at the time.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // When the session ends underneath the player (the server rejected the
  // refresh token: expired, revoked, signed out elsewhere), send them to
  // Welcome. Before, the tokens were cleared but the app stayed on Main,
  // showing empty screens that could never load.
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  useEffect(
    () =>
      useTokenStore.subscribe((state, previous) => {
        if (previous.refreshToken && !state.refreshToken && navigationRef.isReady()) {
          const current = navigationRef.getCurrentRoute()?.name;
          if (current && !SIGNED_OUT_ROUTES.has(current)) {
            navigationRef.reset({ index: 0, routes: [{ name: 'Welcome' }] });
          }
        }
      }),
    [navigationRef],
  );

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      theme={{
        dark: mode === 'dark',
        colors: {
          primary: colors.arcane,
          background: colors.background,
          card: colors.surface,
          text: colors.ink,
          border: colors.border,
          notification: colors.arcaneSoft,
        },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Splash">
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Registration" component={RegistrationScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="RecoverAccount" component={RecoverAccountScreen} />
        <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        <Stack.Screen name="Biodata" component={BiodataScreen} />
        <Stack.Screen name="OnboardingGoal" component={OnboardingGoalScreen} />
        <Stack.Screen name="ClanSelection" component={ClanSelectionScreen} />
        <Stack.Screen name="AppIntro" component={AppIntroScreen} />
        <Stack.Screen name="Main" component={MainTabNavigator} />
        <Stack.Screen name="DailyQuest" component={framed(DailyQuestScreen)} />
        <Stack.Screen name="QuestComplete" component={framed(QuestCompleteScreen)} />
        <Stack.Screen name="CatchUpCalendar" component={framed(CatchUpCalendarScreen)} />
        <Stack.Screen name="CatchUpReplay" component={framed(CatchUpReplayScreen)} />
        <Stack.Screen name="SkillRadar" component={framed(SkillRadarScreen)} />
        {/* Word in the Wild is parked for V2 (WordQuest+) -- see config/features. */}
        {FEATURES.wordInTheWild && (
          <>
            <Stack.Screen name="WordInTheWild" component={framed(WordInTheWildScreen)} />
            <Stack.Screen name="SubmitEvidence" component={framed(SubmitEvidenceScreen)} />
            <Stack.Screen name="EvidenceResult" component={framed(EvidenceResultScreen)} />
          </>
        )}
        <Stack.Screen name="Achievements" component={framed(AchievementsScreen)} />
        <Stack.Screen name="Ali" component={framed(AliScreen)} />
        <Stack.Screen name="AliGallery" component={framed(AliGalleryScreen)} />
        <Stack.Screen name="BossBattle" component={framed(BossBattleScreen)} />
        <Stack.Screen name="ScrambleQuest" component={framed(ScrambleQuestScreen)} />
        <Stack.Screen name="CompleteIt" component={framed(CompleteItScreen)} />
        <Stack.Screen name="Hangman" component={framed(HangmanScreen)} />
        <Stack.Screen name="WordDuel" component={framed(WordDuelScreen)} />
        <Stack.Screen
          name="BossBattleLeaderboard"
          component={framed(BossBattleLeaderboardScreen)}
        />
        <Stack.Screen name="MasterChallenge" component={framed(MasterChallengeScreen)} />
        <Stack.Screen name="Order" component={framed(OrderScreen)} />
        <Stack.Screen name="Settings" component={framed(SettingsScreen)} />
        <Stack.Screen name="TwoFactor" component={framed(TwoFactorSettingsScreen)} />
        <Stack.Screen name="ProfileSettings" component={framed(ProfileSettingsScreen)} />
        <Stack.Screen name="Shop" component={framed(ShopScreen)} />
        <Stack.Screen name="Notifications" component={framed(NotificationsScreen)} />
        <Stack.Screen name="CalibrationResult" component={framed(CalibrationResultScreen)} />
        <Stack.Screen name="QuestCardGallery" component={framed(QuestCardGalleryScreen)} />
        <Stack.Screen name="QuestCardDetail" component={framed(QuestCardDetailScreen)} />
        <Stack.Screen name="WordMastery" component={framed(WordMasteryScreen)} />
        <Stack.Screen name="WordPractice" component={framed(WordPracticeScreen)} />
        <Stack.Screen name="LevelRoadmap" component={framed(LevelRoadmapScreen)} />
        <Stack.Screen name="PrivacyPolicy" component={framed(PrivacyPolicyScreen)} />
        <Stack.Screen name="TermsOfService" component={framed(TermsOfServiceScreen)} />
        <Stack.Screen name="DataDeletion" component={framed(DataDeletionScreen)} />
        <Stack.Screen name="AgeRestriction" component={framed(AgeRestrictionScreen)} />
        <Stack.Screen name="Language" component={framed(LanguageScreen)} />
        <Stack.Screen name="About" component={framed(AboutScreen)} />
        <Stack.Screen name="SendFeedback" component={framed(SendFeedbackScreen)} />
        <Stack.Screen name="AdminDashboard" component={framed(AdminDashboardScreen)} />
        <Stack.Screen name="Friends" component={framed(FriendsScreen)} />
        <Stack.Screen name="PublicProfile" component={framed(PublicProfileScreen)} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
