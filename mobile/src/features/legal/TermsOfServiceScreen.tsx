import { useTranslation } from 'react-i18next';
import { LegalDocScreen } from '@/components/LegalDocScreen';
import {
  TERMS_OF_SERVICE_INTRO,
  TERMS_OF_SERVICE_LAST_UPDATED,
  TERMS_OF_SERVICE_SECTIONS,
} from '@/constants/termsOfService';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'TermsOfService'>;

/**
 * Reachable from Settings > About. Content lives in constants/termsOfService.ts.
 *
 * i18n note: only the screen title is translated here — the document
 * body itself is out of scope; see src/i18n/index.ts's doc comment.
 */
export function TermsOfServiceScreen({ navigation }: Props) {
  const { t } = useTranslation('legal');
  return (
    <LegalDocScreen
      title={t('termsOfService.title')}
      lastUpdated={TERMS_OF_SERVICE_LAST_UPDATED}
      intro={TERMS_OF_SERVICE_INTRO}
      sections={TERMS_OF_SERVICE_SECTIONS}
      onBack={() => navigation.goBack()}
    />
  );
}
