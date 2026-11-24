import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useProgressStore } from '@/state/progressStore';
import { Screen } from '@/ui/Screen';

const parseLevel = (value: string | string[] | undefined): number | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  const level = raw === undefined ? Number.NaN : Number(raw);
  return Number.isInteger(level) && level >= 1 ? level : null;
};

export default function GameScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ mode?: string; level?: string }>();
  const progressLevel = useProgressStore((state) => state.level);
  const level = parseLevel(params.level) ?? progressLevel;

  return <Screen title={t('game.title', { n: level })} />;
}
