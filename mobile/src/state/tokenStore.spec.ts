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

  // Regression coverage for the web hydrate() bug (Sept 2026): SecureStore's
  // web shim doesn't implement the read path, so every page load on the
  // browser-play build looked logged-out even right after a real login.
  // tokenStore.ts picks its storage backend once, at module-eval time, off
  // Platform.OS -- jest.isolateModules gives each require() its own fresh
  // module registry (including a fresh 'react-native'), so mutating
  // Platform.OS *inside* that scope, before requiring tokenStore.ts, is
  // what actually makes the fresh module pick the web branch (resetModules
  // alone re-imports a fresh Platform too, silently reverting OS back to
  // native and defeating the point -- confirmed by this test failing
  // against SecureStore instead of localStorage without isolateModules).
  describe('web storage backend', () => {
    let fakeLocalStorage: Record<string, string>;

    function requireWebTokenStore(): typeof useTokenStore {
      let fresh!: typeof useTokenStore;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const RN = require('react-native');
        RN.Platform.OS = 'web';
        (global as unknown as { window: unknown }).window = {
          localStorage: {
            getItem: (key: string) => (key in fakeLocalStorage ? fakeLocalStorage[key] : null),
            setItem: (key: string, value: string) => {
              fakeLocalStorage[key] = value;
            },
            removeItem: (key: string) => {
              delete fakeLocalStorage[key];
            },
          },
        };
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        fresh = require('./tokenStore').useTokenStore;
      });
      return fresh;
    }

    beforeEach(() => {
      fakeLocalStorage = {};
    });

    afterEach(() => {
      delete (global as unknown as { window?: unknown }).window;
    });

    it('persists and reloads tokens via localStorage, never SecureStore', async () => {
      const webTokenStore = requireWebTokenStore();

      await webTokenStore.getState().setTokens('web-access', 'web-refresh');
      expect(fakeLocalStorage['wordquest.accessToken.v2']).toBe('web-access');
      expect(fakeLocalStorage['wordquest.refreshToken.v2']).toBe('web-refresh');

      // A second fresh module instance simulates a page reload -- this is
      // exactly the hydrate() path that was silently failing before.
      const reloadedStore = requireWebTokenStore();
      const loaded = await reloadedStore.getState().loadTokens();

      expect(loaded).toEqual({ accessToken: 'web-access', refreshToken: 'web-refresh' });
      expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
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
