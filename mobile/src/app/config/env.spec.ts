jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

import { PRODUCTION_API_URL, resolveApiUrl } from './env';

describe('resolveApiUrl', () => {
  it('keeps the localhost default in development', () => {
    expect(resolveApiUrl(undefined, true)).toBe('http://localhost:3000/api/v1');
    expect(resolveApiUrl('http://192.168.1.5:3000/api/v1', true)).toBe('http://192.168.1.5:3000/api/v1');
  });

  it('accepts an https URL in a release build', () => {
    expect(resolveApiUrl('https://api.example.com/api/v1', false)).toBe('https://api.example.com/api/v1');
  });

  it('never lets a release build use plain http or a missing URL', () => {
    expect(resolveApiUrl('http://api.example.com/api/v1', false)).toBe(PRODUCTION_API_URL);
    expect(resolveApiUrl(undefined, false)).toBe(PRODUCTION_API_URL);
  });
});
