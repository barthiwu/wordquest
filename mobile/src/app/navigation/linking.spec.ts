import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './RootNavigator';

// Regression coverage for the web-subpath deep-linking bug (2026-09-29):
// the GitHub Pages build is deployed under a subpath (app.json's
// experiments.baseUrl, "/wordquest"), and left uncorrected this broke
// both directions -- an opened verify-email/reset-password link never
// matched any screen (INCOMING), and every in-app navigation rewrote
// the browser's address bar to a root-relative URL missing that
// subpath entirely (OUTGOING), which then 404s on the next refresh.
// See linking.ts's own doc comment for the full mechanism.
//
// Same jest.isolateModules pattern as tokenStore.spec.ts's web-storage
// tests: a fresh 'react-native' module per isolated require is what
// lets Platform.OS='web' actually stick for the module-under-test,
// rather than resetModules() alone (which also reverts Platform.OS).
// expo-constants, expo-linking, and @react-navigation/native's own
// getPathFromState are all replaced with plain mocks inside the
// isolated scope -- this test is about linking.ts's own web-subpath
// wrapping logic, not about exercising those libraries for real.
describe('linking (web subpath)', () => {
  afterEach(() => {
    delete (global as unknown as { window?: unknown }).window;
  });

  function requireWebLinking(baseUrl: string): LinkingOptions<RootStackParamList> {
    let fresh!: LinkingOptions<RootStackParamList>;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const RN = require('react-native');
      RN.Platform.OS = 'web';

      (global as unknown as { window: unknown }).window = {
        location: { origin: 'https://barthiwu.github.io' },
      };

      jest.doMock('expo-constants', () => ({
        __esModule: true,
        default: { expoConfig: { experiments: { baseUrl } } },
      }));

      jest.doMock('expo-linking', () => ({
        createURL: jest.fn(() => 'exp://mock/'),
      }));

      jest.doMock('@react-navigation/native', () => ({
        ...jest.requireActual('@react-navigation/native'),
        getPathFromState: jest.fn(() => '/welcome'),
      }));

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      fresh = require('./linking').linking;
    });
    return fresh;
  }

  it('adds the real deployed origin+baseUrl as a prefix, ahead of the origin-only one', () => {
    const linking = requireWebLinking('/wordquest');

    expect(linking.prefixes[0]).toBe('https://barthiwu.github.io/wordquest');
  });

  it('prepends the baseUrl onto every outgoing path, so the address bar keeps the subpath', () => {
    const linking = requireWebLinking('/wordquest');

    expect(linking.getPathFromState).toBeDefined();
    const path = linking.getPathFromState!({} as never, {} as never);

    expect(path).toBe('/wordquest/welcome');
  });

  it('leaves getPathFromState unset when there is no configured baseUrl (local web dev)', () => {
    const linking = requireWebLinking('');

    expect(linking.getPathFromState).toBeUndefined();
    expect(linking.prefixes[0]).toBe('https://barthiwu.github.io');
  });

  // The actual bug (2026-09-29): useLinking's web implementation hands
  // getStateFromPath the raw `location.pathname + location.search`
  // directly -- it never consults `prefixes` the way native's
  // Linking.parse() does -- so an incoming deep link still carrying the
  // "/wordquest" subpath never matched any configured screen and
  // silently resolved to `undefined`, falling back to the Stack's
  // default initialRouteName ("Splash") and discarding the link. These
  // three cases were the ones missing from this file that let that ship
  // untested despite the "INCOMING" fix already being claimed above.
  describe('getStateFromPath', () => {
    it('strips the baseUrl off an incoming path before resolving, so a deep link matches its screen', () => {
      const linking = requireWebLinking('/wordquest');

      expect(linking.getStateFromPath).toBeDefined();
      const state = linking.getStateFromPath!(
        '/wordquest/verify-email?token=test123',
        linking.config,
      );

      expect(state?.routes).toEqual([
        expect.objectContaining({ name: 'VerifyEmail', params: { token: 'test123' } }),
      ]);
    });

    it('resolves the root path (no extra segment after the baseUrl) same as before the fix', () => {
      const linking = requireWebLinking('/wordquest');

      // Neither "/wordquest" nor "/wordquest/" match any configured
      // screen (Splash/Welcome/Main aren't URL-reachable -- see the
      // config comment below) -- resolving to `undefined` here is
      // correct and is what lets the Stack fall back to its default
      // initialRouteName="Splash" for a plain, non-deep-linked launch.
      expect(linking.getStateFromPath!('/wordquest', linking.config)).toBeUndefined();
      expect(linking.getStateFromPath!('/wordquest/', linking.config)).toBeUndefined();
    });

    it('keeps the baseUrl on the path React Navigation remembers, so the address bar is not rewritten without it', () => {
      const linking = requireWebLinking('/wordquest');
      const state = linking.getStateFromPath!('/wordquest/data-deletion', linking.config);
      expect(state?.routes).toEqual([
        expect.objectContaining({ name: 'DataDeletion', path: '/wordquest/data-deletion' }),
      ]);
    });

    it('re-prefixes nested routes too (a restored tab such as /wordquest/home)', () => {
      const linking = requireWebLinking('/wordquest');
      const state = linking.getStateFromPath!('/wordquest/home', linking.config);
      const main = state?.routes.at(0);
      expect(main?.name).toBe('Main');
      expect(main?.state?.routes.at(0)).toEqual(
        expect.objectContaining({ name: 'Home', path: '/wordquest/home' }),
      );
    });

    it('treats a trailing slash (GitHub Pages adds one) like the plain path', () => {
      const linking = requireWebLinking('/wordquest');
      const state = linking.getStateFromPath!('/wordquest/data-deletion/', linking.config);
      expect(state?.routes).toEqual([
        expect.objectContaining({ name: 'DataDeletion', path: '/wordquest/data-deletion' }),
      ]);
    });

    it('leaves getStateFromPath unset when there is no configured baseUrl (local web dev)', () => {
      const linking = requireWebLinking('');

      expect(linking.getStateFromPath).toBeUndefined();
    });
  });
});
