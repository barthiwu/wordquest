import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/state/themeStore';
import { useIsNewLook } from '@/state/uiVersionStore';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { ResponsiveTabBar, navInset } from './ResponsiveTabBar';
import { HomeScreen } from '@/features/home/HomeScreen';
import { PlayScreen } from '@/features/play/PlayScreen';
import { JourneyScreen } from '@/features/journey/JourneyScreen';
import { LeaderboardScreen } from '@/features/leaderboards/LeaderboardScreen';
import { PassportScreen } from '@/features/passport/PassportScreen';

export type MainTabParamList = {
  Home: undefined;
  Play: undefined;
  Journey: undefined;
  Compete: undefined;
  Profile: undefined;
};

const TAB_ICONS: Record<
  keyof MainTabParamList,
  { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Play: { active: 'game-controller', inactive: 'game-controller-outline' },
  Journey: { active: 'map', inactive: 'map-outline' },
  Compete: { active: 'trophy', inactive: 'trophy-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * The authenticated app's main navigation, per the handover doc's
 * five-tab structure. Internal route keys stay 'Play'/'Compete' (every
 * navigation.navigate/screen-prop type still keys off them), but their
 * on-screen labels were swapped Sept 2026: the 'Play' route now reads
 * "Compete" (t('tabs.play')) — Daily Quest, Arcade and Boss Battle all
 * live there, and Boss Battle is the game's headline competitive mode —
 * and the 'Compete' route, which only ever hosted leaderboards, now
 * reads "Leaderboard" (t('tabs.compete')) to say what it actually is.
 * Profile hosts Passport, which already serves as the player's
 * profile/résumé view. Skill Radar doesn't get its own tab — it's one
 * tap from Journey, the content it's most directly about.
 */
export function MainTabNavigator() {
  const { t } = useTranslation('common');
  const colors = useThemeColors();
  const newLook = useIsNewLook();
  const { breakpoint } = useBreakpoint();
  return (
    <Tab.Navigator
      tabBar={(props) => <ResponsiveTabBar {...props} />}
      sceneContainerStyle={{ paddingLeft: navInset(newLook, breakpoint) }}
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
      <Tab.Screen name="Play" component={PlayScreen} options={{ tabBarLabel: t('tabs.play') }} />
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
