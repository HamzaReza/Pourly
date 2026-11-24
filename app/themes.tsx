import { useTranslation } from 'react-i18next';

import { Screen } from '@/ui/Screen';

export default function ThemesScreen() {
  const { t } = useTranslation();
  return <Screen title={t('themes.title')} />;
}
