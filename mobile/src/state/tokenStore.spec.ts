import * as SecureStore from 'expo-secure-store';
import { useTokenStore } from './tokenStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe('useTokenStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useTokenStore.setState({ accessToken: null, refreshToken: null });
  });

  describe('loadTokens', () => {
    it('reads both tokens from SecureStore into memory and returns them', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(key === 'wordquest.accessToken.v2' ? 'stored-access' : 'stored-refresh'),
      );

      const result = await useTokenStore.getState().loadTokens();

      expect(result).toEqual({ accessToken: 'stored-access', refreshToken: 'stored-refresh' });
      expect(useTokenStore.getState().accessToken).toBe('stored-access');
      expect(useTokenStore.getState().refreshToken).toBe('stored-refresh');
    });

    it('resolves null tokens (not a crash) when SecureStore has nothing stored', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const result = await useTokenStore.getState().loadTokens();

      expect(result).toEqual({ accessToken: null, refreshToken: null });
    });
  });

  describe('setTokens', () => {
    it('persists both tokens to SecureStore under the expected keys and updates memory', async () => {
      await useTokenStore.getState().setTokens('access-123', 'refresh-456');

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'wordquest.accessToken.v2',
        'access-123',
      );
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'wordquest.refreshToken.v2',
        'refresh-456',
      );
      expect(useTokenStore.getState().accessToken).toBe('access-123');
      expect(useTokenStore.getState().refreshToken).toBe('refresh-456');
    });
  });

  describe('clearTokens', () => {
    it('deletes both tokens from SecureStore and resets memory to null', async () => {
      await useTokenStore.getState().setTokens('access-123', 'refresh-456');
      await useTokenStore.getState().clearTokens();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('wordquest.accessToken.v2');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('wordquest.refreshToken.v2');
      expect(useTokenStore.getState().accessToken).toBeNull();
      expect(useTokenStore.getState().refreshToken).toBeNull();
    });
  });
});
