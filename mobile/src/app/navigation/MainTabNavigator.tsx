import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/state/themeStore';
import { HomeScreen } from '@/features/home/HomeScreen';
import { QuestScreen } from '@/features/quests/QuestScreen';
import { JourneyScreen } from '@/features/journey/JourneyScreen';
import { LeaderboardScreen } from '@/features/leaderboards/LeaderboardScreen';
import { PassportScreen } from '@/features/passport/PassportScreen';

export type MainTabParamList = {
  Home: undefined;
  Quest: undefined;
  Journey: undefined;
  Compete: undefined;
  Profile: undefined;
};

const TAB_ICONS: Record<
  keyof MainTabParamList,
  { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Quest: { active: 'flash', inactive: 'flash-outline' },
  Journey: { active: 'map', inactive: 'map-outline' },
  Compete: { active: 'trophy', inactive: 'trophy-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * The authenticated app's main navigation, per the handover doc's
 * five-tab structure. Compete hosts Leaderboards today (Boss Battles
 * lands here later — build order §47 item 26). Profile hosts Passport,
 * which already serves as the player's profile/résumé view. Skill Radar
 * doesn't get its own tab — it's one tap from Journey, the content it's
 * most directly about.
 */
export function MainTabNavigator() {
  const { t } = useTranslation('common');
  const colors = useThemeColors();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.arcaneSoft,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: ({ focused, color, size }) => {
          const icon = TAB_ICONS[route.name];
          return (
            <Ionicons name={focused ? icon.active : icon.inactive} size={size} color={color} />
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: t('tabs.home') }} />
      <Tab.Screen name="Quest" component={QuestScreen} options={{ tabBarLabel: t('tabs.quest') }} />
      <Tab.Screen
        name="Journey"
        component={JourneyScreen}
        options={{ tabBarLabel: t('tabs.journey') }}
      />
      <Tab.Screen
        name="Compete"
        component={LeaderboardScreen}
        options={{ tabBarLabel: t('tabs.compete') }}
      />
      <Tab.Screen
        name="Profile"
        component={PassportScreen}
        options={{ tabBarLabel: t('tabs.profile') }}
      />
    </Tab.Navigator>
  );
}
