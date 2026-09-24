import { LegalDocScreen } from '@/components/LegalDocScreen';
import {
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
} from '@/constants/privacyPolicy';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'PrivacyPolicy'>;

/**
 * Reachable from Settings > About and from the Registration screen's
 * "By creating an account..." line. Content lives in
 * constants/privacyPolicy.ts, kept by hand in sync with the canonical
 * docs/PRIVACY_POLICY.md at the repo root. Layout itself lives in the
 * shared LegalDocScreen, alongside TermsOfServiceScreen and
 * AgeRestrictionScreen.
 */
export function PrivacyPolicyScreen({ navigation }: Props) {
  return (
    <LegalDocScreen
      title="Privacy Policy"
      lastUpdated={PRIVACY_POLICY_LAST_UPDATED}
      intro={PRIVACY_POLICY_INTRO}
      sections={PRIVACY_POLICY_SECTIONS}
      onBack={() => navigation.goBack()}
    />
  );
}
