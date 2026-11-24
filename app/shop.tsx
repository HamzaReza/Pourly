import { useTranslation } from 'react-i18next';

import { Screen } from '@/ui/Screen';

export default function ShopScreen() {
  const { t } = useTranslation();
  return <Screen title={t('shop.title')} />;
}
