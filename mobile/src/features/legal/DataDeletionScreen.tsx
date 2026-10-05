import { useTranslation } from 'react-i18next';
import { LegalDocScreen } from '@/components/LegalDocScreen';
import {
  DATA_DELETION_INTRO,
  DATA_DELETION_LAST_UPDATED,
  DATA_DELETION_SECTIONS,
} from '@/constants/dataDeletion';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'DataDeletion'>;

/**
 * Public "how to delete your data" page (also the URL given to Facebook's
 * app settings). Reachable by link without signing in.
 */
export function DataDeletionScreen({ navigation }: Props) {
  const { t } = useTranslation('legal');
  return (
    <LegalDocScreen
      title={t('dataDeletion.title', { defaultValue: 'Delete your data' })}
      lastUpdated={DATA_DELETION_LAST_UPDATED}
      intro={DATA_DELETION_INTRO}
      sections={DATA_DELETION_SECTIONS}
      onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('Welcome'))}
    />
  );
}
