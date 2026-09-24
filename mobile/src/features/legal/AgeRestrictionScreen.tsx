import { LegalDocScreen } from '@/components/LegalDocScreen';
import {
  AGE_RESTRICTION_INTRO,
  AGE_RESTRICTION_LAST_UPDATED,
  AGE_RESTRICTION_SECTIONS,
} from '@/constants/ageRestriction';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'AgeRestriction'>;

/** Reachable from Settings > About. Content lives in constants/ageRestriction.ts. */
export function AgeRestrictionScreen({ navigation }: Props) {
  return (
    <LegalDocScreen
      title="Age Restriction"
      lastUpdated={AGE_RESTRICTION_LAST_UPDATED}
      intro={AGE_RESTRICTION_INTRO}
      sections={AGE_RESTRICTION_SECTIONS}
      onBack={() => navigation.goBack()}
    />
  );
}
