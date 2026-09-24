import { NavigationContainer, type NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useThemeColors, useThemeStore } from '@/state/themeStore';
import { SplashScreen } from '@/features/splash/SplashScreen';
import { WelcomeScreen } from '@/features/welcome/WelcomeScreen';
import { RegistrationScreen } from '@/features/auth/RegistrationScreen';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { ForgotPasswordScreen } from '@/features/auth/ForgotPasswordScreen';
import { RecoverAccountScreen } from '@/features/auth/RecoverAccountScreen';
import { VerifyEmailScreen } from '@/features/auth/VerifyEmailScreen';
import { ResetPasswordScreen } from '@/features/auth/ResetPasswordScreen';
import { OnboardingIdentityScreen } from '@/features/onboarding/OnboardingIdentityScreen';
import { OnboardingGoalScreen } from '@/features/onboarding/OnboardingGoalScreen';
import { ClanSelectionScreen } from '@/features/clans/ClanSelectionScreen';
import { MainTabNavigator, type MainTabParamList } from './MainTabNavigator';
import { DailyQuestScreen } from '@/features/quests/DailyQuestScreen';
import { QuestCompleteScreen } from '@/features/quests/QuestCompleteScreen';
import { SkillRadarScreen } from '@/features/skills/SkillRadarScreen';
import { WordInTheWildScreen } from '@/features/word-in-the-wild/WordInTheWildScreen';
import { SubmitEvidenceScreen } from '@/features/word-in-the-wild/SubmitEvidenceScreen';
import { EvidenceResultScreen } from '@/features/word-in-the-wild/EvidenceResultScreen';
import { AchievementsScreen } from '@/features/achievements/AchievementsScreen';
import { AliScreen } from '@/features/ali/AliScreen';
import { BossBattleScreen } from '@/features/boss-battle/BossBattleScreen';
import { BossBattleLeaderboardScreen } from '@/features/boss-battle/BossBattleLeaderboardScreen';
import { MasterChallengeScreen } from '@/features/master-challenge/MasterChallengeScreen';
import { OrderScreen } from '@/features/order/OrderScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
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
import { AgeRestrictionScreen } from '@/features/legal/AgeRestrictionScreen';
import { LanguageScreen } from '@/features/settings/LanguageScreen';
import { AboutScreen } from '@/features/settings/AboutScreen';
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
  OnboardingIdentity: undefined;
  OnboardingGoal: undefined;
  ClanSelection: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  DailyQuest: { questKey: string };
  QuestComplete: WordCompletionResult;
  SkillRadar: undefined;
  WordInTheWild: undefined;
  SubmitEvidence: { missionId: string; word: string; definition: string };
  EvidenceResult: Submission;
  Achievements: undefined;
  Ali: undefined;
  BossBattle: undefined;
  BossBattleLeaderboard: undefined;
  MasterChallenge: undefined;
  Order: undefined;
  Settings: undefined;
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
  AgeRestriction: undefined;
  Language: undefined;
  About: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const colors = useThemeColors();
  const mode = useThemeStore((s) => s.mode);
  return (
    <NavigationContainer
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
        <Stack.Screen name="OnboardingIdentity" component={OnboardingIdentityScreen} />
        <Stack.Screen name="OnboardingGoal" component={OnboardingGoalScreen} />
        <Stack.Screen name="ClanSelection" component={ClanSelectionScreen} />
        <Stack.Screen name="Main" component={MainTabNavigator} />
        <Stack.Screen name="DailyQuest" component={DailyQuestScreen} />
        <Stack.Screen name="QuestComplete" component={QuestCompleteScreen} />
        <Stack.Screen name="SkillRadar" component={SkillRadarScreen} />
        <Stack.Screen name="WordInTheWild" component={WordInTheWildScreen} />
        <Stack.Screen name="SubmitEvidence" component={SubmitEvidenceScreen} />
        <Stack.Screen name="EvidenceResult" component={EvidenceResultScreen} />
        <Stack.Screen name="Achievements" component={AchievementsScreen} />
        <Stack.Screen name="Ali" component={AliScreen} />
        <Stack.Screen name="BossBattle" component={BossBattleScreen} />
        <Stack.Screen name="BossBattleLeaderboard" component={BossBattleLeaderboardScreen} />
        <Stack.Screen name="MasterChallenge" component={MasterChallengeScreen} />
        <Stack.Screen name="Order" component={OrderScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Shop" component={ShopScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="CalibrationResult" component={CalibrationResultScreen} />
        <Stack.Screen name="QuestCardGallery" component={QuestCardGalleryScreen} />
        <Stack.Screen name="QuestCardDetail" component={QuestCardDetailScreen} />
        <Stack.Screen name="WordMastery" component={WordMasteryScreen} />
        <Stack.Screen name="WordPractice" component={WordPracticeScreen} />
        <Stack.Screen name="LevelRoadmap" component={LevelRoadmapScreen} />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
        <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
        <Stack.Screen name="AgeRestriction" component={AgeRestrictionScreen} />
        <Stack.Screen name="Language" component={LanguageScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
