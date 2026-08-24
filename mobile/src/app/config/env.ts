import Constants from 'expo-constants';

/**
 * Central place the app reads runtime config from — nothing else in the
 * app should reach into `expo-constants` or `process.env` directly.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string };

export const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? 'http://localhost:3000/api/v1',
};
