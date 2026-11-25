/**
 * Fakes for `expo-notifications` and `expo-store-review`, injected with
 * `setNotificationsModuleLoader` / `setStoreReviewLoader`. Every call is appended to `calls` in
 * order, so tests can check that the channel exists before a request or a schedule.
 */
type NotificationsModule = typeof import('expo-notifications');
type StoreReviewModule = typeof import('expo-store-review');

export interface FakePermission {
  granted: boolean;
  canAskAgain: boolean;
}

export interface FakeResponse {
  actionIdentifier: string;
  notification: {
    date: number;
    request: { identifier: string; content: { data?: Record<string, unknown> } };
  };
}

export interface ScheduledRequest {
  identifier: string;
  content: { title: string; body: string; data: Record<string, unknown>; color?: string };
  trigger: { type: string; date: Date; channelId: string };
}

/** A notification response for `url`; `date` makes it unique. */
export const fakeResponse = (identifier: string, url: string, date = 1): FakeResponse => ({
  actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
  notification: { date, request: { identifier, content: { data: { url } } } },
});

export const createFakeNotifications = (initial: FakePermission) => {
  const state = {
    permission: { ...initial },
    /** What the system prompt answers. */
    requestAnswer: { granted: true, canAskAgain: true } as FakePermission,
    lastResponse: null as FakeResponse | null,
    responseListener: null as ((response: FakeResponse) => void) | null,
  };
  const calls: string[] = [];
  const scheduled: ScheduledRequest[] = [];
  const asStatus = (permission: FakePermission) => ({
    ...permission,
    status: permission.granted ? 'granted' : 'denied',
    expires: 'never' as const,
  });
  const fake = {
    SchedulableTriggerInputTypes: { DATE: 'date' },
    AndroidImportance: { DEFAULT: 5 },
    getPermissionsAsync: jest.fn(() => Promise.resolve(asStatus(state.permission))),
    requestPermissionsAsync: jest.fn(() => {
      calls.push('request');
      state.permission = { ...state.requestAnswer };
      return Promise.resolve(asStatus(state.permission));
    }),
    setNotificationChannelAsync: jest.fn(
      (id: string, channel: { name: string; importance: number }) => {
        calls.push(`channel:${id}:${channel.name}:${channel.importance}`);
        return Promise.resolve(null);
      },
    ),
    cancelAllScheduledNotificationsAsync: jest.fn(() => {
      calls.push('cancelAll');
      scheduled.length = 0;
      return Promise.resolve();
    }),
    scheduleNotificationAsync: jest.fn((request: ScheduledRequest) => {
      calls.push(`schedule:${request.identifier}`);
      scheduled.push(request);
      return Promise.resolve(request.identifier);
    }),
    setNotificationHandler: jest.fn(),
    addNotificationResponseReceivedListener: jest.fn(
      (listener: (response: FakeResponse) => void) => {
        state.responseListener = listener;
        return { remove: jest.fn() };
      },
    ),
    getLastNotificationResponse: jest.fn(() => state.lastResponse),
    clearLastNotificationResponse: jest.fn(() => {
      state.lastResponse = null;
    }),
  };
  return {
    state,
    calls,
    scheduled,
    fake,
    module: fake as unknown as NotificationsModule,
    loader: () => Promise.resolve(fake as unknown as NotificationsModule),
  };
};

export const createFakeStoreReview = (available: boolean) => {
  const fake = {
    isAvailableAsync: jest.fn(() => Promise.resolve(available)),
    requestReview: jest.fn(() => Promise.resolve()),
  };
  return {
    fake,
    loader: () => Promise.resolve(fake as unknown as StoreReviewModule),
  };
};
