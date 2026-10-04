import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Public OAuth client IDs for the sign-in providers. These are NOT secrets
 * (they ship in every client); set them in app.json `extra.social` or the
 * matching EXPO_PUBLIC_* env vars. The same IDs must also be listed in the
 * backend's GOOGLE_CLIENT_IDS so it accepts tokens minted for them.
 * A provider with no ID for the current platform is simply not offered.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as {
  social?: { googleWebClientId?: string; googleIosClientId?: string };
};

const clean = (v: string | undefined | null) => (v && v.trim().length > 0 ? v.trim() : undefined);

/** The Google client ID for this platform, or undefined when Google sign-in isn't set up here. */
export function googleClientIdForPlatform(): string | undefined {
  if (Platform.OS === 'ios') {
    return clean(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) ?? clean(extra.social?.googleIosClientId);
  }
  if (Platform.OS === 'web') {
    return clean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) ?? clean(extra.social?.googleWebClientId);
  }
  // Android Google sign-in needs a registered package-scheme redirect; not offered yet.
  return undefined;
}

/** Google's iOS redirect scheme is the client ID reversed: "123-abc.apps.googleusercontent.com" → "com.googleusercontent.apps.123-abc". */
export function googleIosRedirectUri(clientId: string): string {
  const prefix = clientId.replace(/\.apps\.googleusercontent\.com$/, '');
  return `com.googleusercontent.apps.${prefix}:/oauthredirect`;
}
