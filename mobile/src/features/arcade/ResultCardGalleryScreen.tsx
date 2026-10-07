import { ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/state/themeStore';
import { BackButton } from '@/components/BackButton';
import { PodiumNightCard } from '@/components/resultCard/PodiumNightCard';
import { TrophyCeremonyCard } from '@/components/resultCard/TrophyCeremonyCard';
import { QuestCardResult } from '@/components/resultCard/QuestCardResult';
import { sampleResultCard } from '@/components/resultCard/sample';

/** Design review: the three result-card directions side by side, with sample data. */
export function ResultCardGalleryScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const data = sampleResultCard();
  const cards = [
    ['A · Podium Night', <PodiumNightCard key="a" data={data} />],
    ['B · Trophy Ceremony', <TrophyCeremonyCard key="b" data={data} />],
    ['C · Quest Card', <QuestCardResult key="c" data={data} />],
  ] as const;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, gap: 24, alignItems: 'center' }}
    >
      <BackButton onPress={() => navigation.goBack()} />
      {cards.map(([label, card]) => (
        <View key={label} style={{ gap: 8, alignItems: 'center' }}>
          <Text style={{ color: colors.ink, fontWeight: '800' }}>{label}</Text>
          {card}
        </View>
      ))}
    </ScrollView>
  );
}
