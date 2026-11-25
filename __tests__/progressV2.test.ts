import { migrateProgress, sanitizeProgress } from '@/state/migrations';
import { createDefaultProgress, PROGRESS_VERSION } from '@/state/progressModel';
import { applyInterstitialShown, applyResetProgress } from '@/state/progressReducers';
import { applyTouchOpen } from '@/state/progressStore';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

describe('progress v2', () => {
  it('is version 2 with the new fields defaulted', () => {
    expect(PROGRESS_VERSION).toBe(2);
    const fresh = createDefaultProgress(NOW);
    expect(fresh.firstSessionStartedAt).toBe(NOW);
    expect(fresh.pendingPurchases).toEqual([]);
  });

  it('migrates v1 data: the first session starts at the last open', () => {
    const v1 = { ...createDefaultProgress(NOW - 5000), lastOpenAt: NOW - 1000 } as Record<
      string,
      unknown
    >;
    delete v1.firstSessionStartedAt;
    delete v1.pendingPurchases;
    const migrated = migrateProgress(v1, 1, NOW);
    expect(migrated.firstSessionStartedAt).toBe(NOW - 1000);
    expect(migrated.pendingPurchases).toEqual([]);
    expect(migrated.schemaVersion).toBe(2);
  });

  it('validates the new fields', () => {
    const state = sanitizeProgress(
      {
        firstSessionStartedAt: 'yesterday',
        pendingPurchases: [
          { productId: 'coins_500', since: NOW },
          { productId: 'coins_500', since: NOW + 1 },
          { productId: '', since: NOW },
          { productId: 'coins_1500', since: 'soon' },
          'junk',
        ],
      },
      NOW,
    );
    expect(state.firstSessionStartedAt).toBe(NOW);
    expect(state.pendingPurchases).toEqual([{ productId: 'coins_500', since: NOW }]);
    const many = Array.from({ length: 25 }, (_, i) => ({ productId: `p${i}`, since: i }));
    expect(sanitizeProgress({ pendingPurchases: many }, NOW).pendingPurchases).toHaveLength(20);
  });

  it('stamps the first session on the very first open only', () => {
    const first = applyTouchOpen(createDefaultProgress(NOW - 50), NOW);
    expect(first).toMatchObject({ sessionCount: 1, firstSessionStartedAt: NOW });
    const second = applyTouchOpen(first, NOW + 1000);
    expect(second.firstSessionStartedAt).toBe(NOW);
  });

  it('keeps the first-session stamp and pending purchases on reset', () => {
    const state = {
      ...createDefaultProgress(NOW),
      firstSessionStartedAt: NOW - 99,
      pendingPurchases: [{ productId: 'coins_500', since: NOW }],
    };
    const reset = applyResetProgress(state, NOW + 1);
    expect(reset.firstSessionStartedAt).toBe(NOW - 99);
    expect(reset.pendingPurchases).toEqual([{ productId: 'coins_500', since: NOW }]);
  });

  it('records a shown interstitial', () => {
    const state = createDefaultProgress(NOW);
    const shown = applyInterstitialShown(
      { ...state, ads: { ...state.ads, levelsSinceInterstitial: 4 } },
      NOW + 5,
    );
    expect(shown.ads).toMatchObject({ levelsSinceInterstitial: 0, lastInterstitialAt: NOW + 5 });
  });
});
