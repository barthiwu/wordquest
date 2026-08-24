import { Linking, Platform } from 'react-native';

/**
 * Each test needs its own isolated module registry (jest.isolateModules +
 * jest.doMock, not a static top-level jest.mock) because expo-device's
 * `isDevice` needs to differ per test, and mutating a property on an
 * already-imported mock namespace object doesn't reliably propagate to
 * the separately-babel-interop-wrapped namespace object the module under
 * test itself imports.
 */
function loadWithMocks(opts: {
  isDevice?: boolean;
  permissionStatus?: string;
  requestedStatus?: string;
  tokenData?: string;
  throwOnPermissionsCheck?: boolean;
  registerPushTokenImpl?: (...args: unknown[]) => Promise<void>;
  lastNotificationResponse?: unknown;
  throwOnLastNotificationResponse?: boolean;
}) {
  const {
    isDevice = true,
    permissionStatus = 'granted',
    requestedStatus = 'granted',
    tokenData = 'ExponentPushToken[abc]',
    throwOnPermissionsCheck = false,
    registerPushTokenImpl = () => Promise.resolve(),
    lastNotificationResponse = null,
    throwOnLastNotificationResponse = false,
  } = opts;

  const notificationsMock = {
    getPermissionsAsync: jest.fn(() =>
      throwOnPermissionsCheck
        ? Promise.reject(new Error('no EAS project id'))
        : Promise.resolve({ status: permissionStatus }),
    ),
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: requestedStatus })),
    setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
    getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: tokenData })),
    getLastNotificationResponseAsync: jest.fn(() =>
      throwOnLastNotificationResponse
        ? Promise.reject(new Error('not available'))
        : Promise.resolve(lastNotificationResponse),
    ),
    addNotificationResponseReceivedListener: jest.fn<
      { remove: () => void },
      [(response: unknown) => void]
    >(() => ({ remove: jest.fn() })),
    AndroidImportance: { DEFAULT: 3 },
  };
  const registerPushTokenMock = jest.fn(registerPushTokenImpl);

  let mod: typeof import('./pushNotifications');
  jest.isolateModules(() => {
    jest.doMock('expo-device', () => ({ isDevice }));
    jest.doMock('expo-notifications', () => notificationsMock);
    jest.doMock('../services/notifications', () => ({ registerPushToken: registerPushTokenMock }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('./pushNotifications');
  });

  return {
    registerForPushNotificationsAsync: mod!.registerForPushNotificationsAsync,
    syncPushToken: mod!.syncPushToken,
    subscribeToNotificationTaps: mod!.subscribeToNotificationTaps,
    notificationsMock,
    registerPushTokenMock,
  };
}

function notificationResponse(deepLink: unknown): unknown {
  return { notification: { request: { content: { data: { deepLink } } } } };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('registerForPushNotificationsAsync', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
  });

  it('returns null on a simulator/emulator, without requesting permission', async () => {
    const { registerForPushNotificationsAsync, notificationsMock } = loadWithMocks({
      isDevice: false,
    });

    const result = await registerForPushNotificationsAsync();

    expect(result).toBeNull();
    expect(notificationsMock.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('uses the existing permission when already granted, without re-requesting', async () => {
    const { registerForPushNotificationsAsync, notificationsMock } = loadWithMocks({
      permissionStatus: 'granted',
      tokenData: 'ExponentPushToken[abc]',
    });

    const result = await registerForPushNotificationsAsync();

    expect(notificationsMock.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(result).toEqual({ token: 'ExponentPushToken[abc]', platform: 'ios' });
  });

  it('requests permission when not already granted', async () => {
    const { registerForPushNotificationsAsync, notificationsMock } = loadWithMocks({
      permissionStatus: 'undetermined',
      requestedStatus: 'granted',
      tokenData: 'tok',
    });

    const result = await registerForPushNotificationsAsync();

    expect(notificationsMock.requestPermissionsAsync).toHaveBeenCalled();
    expect(result).toEqual({ token: 'tok', platform: 'ios' });
  });

  it('returns null when permission is denied', async () => {
    const { registerForPushNotificationsAsync, notificationsMock } = loadWithMocks({
      permissionStatus: 'denied',
      requestedStatus: 'denied',
    });

    const result = await registerForPushNotificationsAsync();

    expect(result).toBeNull();
    expect(notificationsMock.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('sets up the default Android channel only on Android', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
    const { registerForPushNotificationsAsync, notificationsMock } = loadWithMocks({
      tokenData: 'tok',
    });

    const result = await registerForPushNotificationsAsync();

    expect(notificationsMock.setNotificationChannelAsync).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ name: 'default' }),
    );
    expect(result).toEqual({ token: 'tok', platform: 'android' });
  });

  it('returns null rather than throwing when the SDK call itself fails', async () => {
    const { registerForPushNotificationsAsync } = loadWithMocks({ throwOnPermissionsCheck: true });

    const result = await registerForPushNotificationsAsync();

    expect(result).toBeNull();
  });
});

describe('syncPushToken', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
  });

  it('returns synchronously without awaiting the device/network round-trip', () => {
    const { syncPushToken } = loadWithMocks({});
    expect(() => syncPushToken('tok')).not.toThrow();
  });

  it('registers the device token with the backend once acquired', async () => {
    const { syncPushToken, registerPushTokenMock } = loadWithMocks({
      tokenData: 'ExponentPushToken[abc]',
    });

    syncPushToken('access-tok');
    await flush();
    await flush();

    expect(registerPushTokenMock).toHaveBeenCalledWith(
      'access-tok',
      'ExponentPushToken[abc]',
      'ios',
    );
  });

  it('never calls the backend when no device token could be acquired', async () => {
    const { syncPushToken, registerPushTokenMock } = loadWithMocks({ isDevice: false });

    syncPushToken('access-tok');
    await flush();
    await flush();

    expect(registerPushTokenMock).not.toHaveBeenCalled();
  });

  it('swallows a backend registration failure without throwing', async () => {
    const { syncPushToken } = loadWithMocks({
      registerPushTokenImpl: () => Promise.reject(new Error('network error')),
    });

    expect(() => syncPushToken('access-tok')).not.toThrow();
    await flush();
    await flush();
  });
});

describe('subscribeToNotificationTaps', () => {
  let openURLSpy: jest.SpyInstance;

  beforeEach(() => {
    openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  });

  afterEach(() => {
    openURLSpy.mockRestore();
  });

  it('opens the deep link from a notification that launched the app cold', async () => {
    const { subscribeToNotificationTaps } = loadWithMocks({
      lastNotificationResponse: notificationResponse('wordquest://boss-battle'),
    });

    subscribeToNotificationTaps();
    await flush();
    await flush();

    expect(openURLSpy).toHaveBeenCalledWith('wordquest://boss-battle');
  });

  it('does nothing when the app was not launched by a notification', async () => {
    const { subscribeToNotificationTaps } = loadWithMocks({ lastNotificationResponse: null });

    subscribeToNotificationTaps();
    await flush();
    await flush();

    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('opens the deep link for a tap that happens while the app is already running', async () => {
    const { subscribeToNotificationTaps, notificationsMock } = loadWithMocks({});

    subscribeToNotificationTaps();
    const listener = notificationsMock.addNotificationResponseReceivedListener.mock.calls[0][0];
    listener(notificationResponse('wordquest://achievements'));
    await flush();

    expect(openURLSpy).toHaveBeenCalledWith('wordquest://achievements');
  });

  it('ignores a notification with no deepLink in its data', async () => {
    const { subscribeToNotificationTaps, notificationsMock } = loadWithMocks({});

    subscribeToNotificationTaps();
    const listener = notificationsMock.addNotificationResponseReceivedListener.mock.calls[0][0];
    listener(notificationResponse(undefined));
    await flush();

    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('swallows a getLastNotificationResponseAsync failure without throwing', async () => {
    const { subscribeToNotificationTaps } = loadWithMocks({
      throwOnLastNotificationResponse: true,
    });

    expect(() => subscribeToNotificationTaps()).not.toThrow();
    await flush();
    await flush();
  });

  it('swallows an unroutable/malformed deep link without throwing', async () => {
    openURLSpy.mockRejectedValueOnce(new Error('no application can handle this URL'));
    const { subscribeToNotificationTaps, notificationsMock } = loadWithMocks({});

    subscribeToNotificationTaps();
    const listener = notificationsMock.addNotificationResponseReceivedListener.mock.calls[0][0];
    listener(notificationResponse('wordquest://boss-battle'));
    await flush();
    await flush();
  });

  it('returns an unsubscribe function that removes the listener', () => {
    const { subscribeToNotificationTaps, notificationsMock } = loadWithMocks({});
    const removeMock = jest.fn();
    notificationsMock.addNotificationResponseReceivedListener.mockReturnValueOnce({
      remove: removeMock,
    });

    const unsubscribe = subscribeToNotificationTaps();
    unsubscribe();

    expect(removeMock).toHaveBeenCalled();
  });
});
