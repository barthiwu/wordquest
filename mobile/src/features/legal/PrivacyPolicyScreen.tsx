import { useTranslation } from 'react-i18next';
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
 *
 * i18n note: only the screen title is translated here — the document
 * body itself (intro/sections, from constants/privacyPolicy.ts) is
 * out of scope; see src/i18n/index.ts's doc comment.
 */
export function PrivacyPolicyScreen({ navigation }: Props) {
  const { t } = useTranslation('legal');
  return (
    <LegalDocScreen
      title={t('privacyPolicy.title')}
      lastUpdated={PRIVACY_POLICY_LAST_UPDATED}
      intro={PRIVACY_POLICY_INTRO}
      sections={PRIVACY_POLICY_SECTIONS}
      onBack={() => navigation.goBack()}
    />
  );
}
