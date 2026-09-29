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
});
