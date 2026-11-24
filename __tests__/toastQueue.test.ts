import {
  currentToast,
  dismissToast,
  MAX_QUEUED_TOASTS,
  showToast,
  subscribeToasts,
} from '@/ui/toastQueue';

const drain = () => {
  for (let toast = currentToast(); toast !== null; toast = currentToast()) dismissToast(toast.id);
};

describe('toast queue', () => {
  beforeEach(drain);

  it('shows toasts in order and notifies subscribers', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToasts(listener);
    showToast('ads.notReady');
    showToast('game.noHint');
    expect(currentToast()?.key).toBe('ads.notReady');
    expect(listener).toHaveBeenCalledTimes(2);
    dismissToast(currentToast()?.id ?? -1);
    expect(currentToast()?.key).toBe('game.noHint');
    unsubscribe();
    dismissToast(currentToast()?.id ?? -1);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(currentToast()).toBeNull();
  });

  it('does not repeat the last message and caps the queue', () => {
    showToast('ads.notReady');
    showToast('ads.notReady');
    showToast('game.noHint');
    showToast('game.title', { n: 1 });
    showToast('game.title', { n: 2 });
    const seen: string[] = [];
    for (let toast = currentToast(); toast !== null; toast = currentToast()) {
      seen.push(`${toast.key}${JSON.stringify(toast.params ?? {})}`);
      dismissToast(toast.id);
    }
    expect(seen).toHaveLength(MAX_QUEUED_TOASTS);
    expect(seen).toEqual(['game.noHint{}', 'game.title{"n":1}', 'game.title{"n":2}']);
  });

  it('ignores unknown ids', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToasts(listener);
    dismissToast(123456);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
