import { useTranslation } from 'react-i18next';

import { Screen } from '@/ui/Screen';

export default function DailyScreen() {
  const { t } = useTranslation();
  return <Screen title={t('daily.title')} />;
}
