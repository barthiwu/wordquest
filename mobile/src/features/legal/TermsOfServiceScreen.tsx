import { LegalDocScreen } from '@/components/LegalDocScreen';
import {
  TERMS_OF_SERVICE_INTRO,
  TERMS_OF_SERVICE_LAST_UPDATED,
  TERMS_OF_SERVICE_SECTIONS,
} from '@/constants/termsOfService';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'TermsOfService'>;

/** Reachable from Settings > About. Content lives in constants/termsOfService.ts. */
export function TermsOfServiceScreen({ navigation }: Props) {
  return (
    <LegalDocScreen
      title="Terms of Service"
      lastUpdated={TERMS_OF_SERVICE_LAST_UPDATED}
      intro={TERMS_OF_SERVICE_INTRO}
      sections={TERMS_OF_SERVICE_SECTIONS}
      onBack={() => navigation.goBack()}
    />
  );
}
