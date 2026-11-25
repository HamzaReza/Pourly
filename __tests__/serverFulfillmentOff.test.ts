import { fulfillTransaction, setSignedInResolver } from '@/services/fulfillment';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';

jest.mock('@/config/constants', () => ({
  ...jest.requireActual('@/config/constants'),
  USE_SERVER_FULFILLMENT: false,
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

describe('USE_SERVER_FULFILLMENT = false', () => {
  it('grants signed-in purchases on the device', () => {
    useProgressStore.setState({ ...createDefaultProgress(NOW), coins: 0 });
    setSignedInResolver(() => true);
    const result = fulfillTransaction(
      { transactionId: 'GPA.1', productId: 'coins_1500', purchasedAt: NOW },
      NOW,
    );
    expect(result.kind).toBe('granted');
    expect(useProgressStore.getState().coins).toBe(1500);
    expect(useProgressStore.getState().processedTransactions).toEqual(['GPA.1']);
  });
});
