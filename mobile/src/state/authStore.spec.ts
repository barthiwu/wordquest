import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from './authStore';
import type { AuthResult } from '@/services/auth';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const authResult: AuthResult = {
  accessToken: 'access-123',
  refreshToken: 'refresh-456',
  user: {
    id: 'u1',
    email: 'barth@example.com',
    displayName: 'Barth',
    username: 'barth',
    countryCode: 'NG',
    avatarUrl: null,
  },
};

describe('useAuthStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isHydrated: false });
  });

  it('starts unhydrated with no session', () => {
    const state = useAuthStore.getState();
    expect(state.isHydrated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
  });

  describe('hydrate', () => {
    it('loads both tokens from SecureStore and marks the store hydrated', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(key === 'wordquest.accessToken.v2' ? 'stored-access' : 'stored-refresh'),
      );

      await useAuthStore.getState().hydrate();

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe('stored-access');
      expect(state.refreshToken).toBe('stored-refresh');
      expect(state.isHydrated).toBe(true);
    });

    it('hydrates to null tokens (not a crash) when SecureStore has nothing stored', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      await useAuthStore.getState().hydrate();

      const state = useAuthStore.getState();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.isHydrated).toBe(true);
    });
  });

  describe('setSession', () => {
    it('persists both tokens to SecureStore under the expected keys', async () => {
      await useAuthStore.getState().setSession(authResult);

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'wordquest.accessToken.v2',
        'access-123',
      );
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'wordquest.refreshToken.v2',
        'refresh-456',
      );
    });

    it('updates in-memory user and tokens', async () => {
      await useAuthStore.getState().setSession(authResult);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(authResult.user);
      expect(state.accessToken).toBe('access-123');
      expect(state.refreshToken).toBe('refresh-456');
    });
  });

  describe('clearSession', () => {
    it('deletes both tokens from SecureStore', async () => {
      await useAuthStore.getState().setSession(authResult);
      await useAuthStore.getState().clearSession();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('wordquest.accessToken.v2');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('wordquest.refreshToken.v2');
    });

    it('resets user and tokens to null in memory', async () => {
      await useAuthStore.getState().setSession(authResult);
      await useAuthStore.getState().clearSession();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
    });

    it('does not disturb isHydrated', async () => {
      useAuthStore.setState({ isHydrated: true });
      await useAuthStore.getState().clearSession();
      expect(useAuthStore.getState().isHydrated).toBe(true);
    });
  });
});
