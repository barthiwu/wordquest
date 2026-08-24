import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  registerPushToken,
  unregisterPushToken,
} from './notifications';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('notifications service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches notifications with no query by default', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);
    await getMyNotifications('tok');
    expect(apiRequest).toHaveBeenCalledWith('/notifications', { accessToken: 'tok' });
  });

  it('adds unreadOnly=true when requested', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce([]);
    await getMyNotifications('tok', true);
    expect(apiRequest).toHaveBeenCalledWith('/notifications?unreadOnly=true', {
      accessToken: 'tok',
    });
  });

  it('marks a single notification read', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(undefined);
    await markNotificationRead('tok', 'n1');
    expect(apiRequest).toHaveBeenCalledWith('/notifications/n1/read', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('marks all notifications read', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(undefined);
    await markAllNotificationsRead('tok');
    expect(apiRequest).toHaveBeenCalledWith('/notifications/read-all', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('fetches preferences', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await getNotificationPreferences('tok');
    expect(apiRequest).toHaveBeenCalledWith('/notifications/preferences', { accessToken: 'tok' });
  });

  it('patches preferences with only the given fields', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await updateNotificationPreferences('tok', { dailyQuestsEnabled: false });
    expect(apiRequest).toHaveBeenCalledWith('/notifications/preferences', {
      method: 'PATCH',
      accessToken: 'tok',
      body: { dailyQuestsEnabled: false },
    });
  });

  it('registers a push token with its platform', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(undefined);
    await registerPushToken('tok', 'ExponentPushToken[abc]', 'ios');
    expect(apiRequest).toHaveBeenCalledWith('/notifications/push-tokens', {
      method: 'POST',
      accessToken: 'tok',
      body: { token: 'ExponentPushToken[abc]', platform: 'ios' },
    });
  });

  it('unregisters a push token, URL-encoding it', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(undefined);
    await unregisterPushToken('tok', 'ExponentPushToken[a/b]');
    expect(apiRequest).toHaveBeenCalledWith(
      '/notifications/push-tokens/ExponentPushToken%5Ba%2Fb%5D',
      { method: 'DELETE', accessToken: 'tok' },
    );
  });
});
