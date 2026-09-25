import { useTranslation } from 'react-i18next';
import { LegalDocScreen } from '@/components/LegalDocScreen';
import {
  AGE_RESTRICTION_INTRO,
  AGE_RESTRICTION_LAST_UPDATED,
  AGE_RESTRICTION_SECTIONS,
} from '@/constants/ageRestriction';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'AgeRestriction'>;

/**
 * Reachable from Settings > About. Content lives in constants/ageRestriction.ts.
 *
 * i18n note: only the screen title is translated here — the document
 * body itself is out of scope; see src/i18n/index.ts's doc comment.
 */
export function AgeRestrictionScreen({ navigation }: Props) {
  const { t } = useTranslation('legal');
  return (
    <LegalDocScreen
      title={t('ageRestriction.title')}
      lastUpdated={AGE_RESTRICTION_LAST_UPDATED}
      intro={AGE_RESTRICTION_INTRO}
      sections={AGE_RESTRICTION_SECTIONS}
      onBack={() => navigation.goBack()}
    />
  );
}
