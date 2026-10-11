import Constants from 'expo-constants';

/**
 * Central place the app reads runtime config from — nothing else in the
 * app should reach into `expo-constants` or `process.env` directly.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string };

/** The live API. A release build never talks to anything else over plain HTTP. */
export const PRODUCTION_API_URL = 'https://wordquest-production-83cf.up.railway.app/api/v1';

/**
 * Release builds only accept an https API URL. A missing or http:// value
 * (a forgotten EXPO_PUBLIC_API_URL, a leaked dev setting) would otherwise ship
 * logins and tokens in cleartext; instead it falls back to the production API.
 * Development builds keep the localhost default so Metro workflows still work.
 */
export function resolveApiUrl(candidate: string | undefined, isDev: boolean): string {
  if (isDev) return candidate ?? 'http://localhost:3000/api/v1';
  return candidate && candidate.startsWith('https://') ? candidate : PRODUCTION_API_URL;
}

export const env = {
  apiUrl: resolveApiUrl(process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl, __DEV__),
};
