import { Platform } from 'react-native';
import type * as AuthSessionTypes from 'expo-auth-session';
import type { SocialProvider } from '@/services/auth';
import { reloadIfStaleBundle } from '@/utils/staleBundle';
import {
  facebookNativeAppId,
  facebookNativeRedirectUri,
  googleClientIdForPlatform,
  googleIosRedirectUri,
} from './socialConfig';

// expo-auth-session / expo-web-browser / expo-crypto are loaded lazily, on
// first use. They need native modules, and a dev-client or store build made
// before they were added doesn't contain them: importing them at startup used
// to take the whole app down to a blank screen. Now only the social buttons
// are affected (they simply aren't offered / report "not available").
async function loadAuthModules() {
  try {
    const [AuthSession, WebBrowser, Crypto] = await Promise.all([
      import('expo-auth-session'),
      import('expo-web-browser'),
      import('expo-crypto'),
    ]);
    // Lets the web popup/redirect hand its result back to the opener.
    WebBrowser.maybeCompleteAuthSession();
    return { AuthSession, Crypto };
  } catch (error) {
    // A web tab older than the latest deploy can't fetch these files; reload it.
    reloadIfStaleBundle(error);
    throw new SocialUnavailableError('GOOGLE');
  }
}

// On web the popup's redirect page must complete the session as soon as it
// loads, before anyone taps a button.
if (Platform.OS === 'web') {
  import('expo-web-browser')
    .then((WebBrowser) => WebBrowser.maybeCompleteAuthSession())
    .catch(() => undefined);
}

/** What a provider handed back — sent verbatim to POST /auth/social. */
export interface SocialCredential {
  provider: SocialProvider;
  credential: string;
  displayName?: string;
}

/** The person closed the sign-in sheet — not an error worth showing. */
export class SocialCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'SocialCancelledError';
  }
}

/** Provider isn't configured/available on this platform. */
export class SocialUnavailableError extends Error {
  constructor(provider: SocialProvider) {
    super(`${provider} sign-in is not available here`);
    this.name = 'SocialUnavailableError';
  }
}

const GOOGLE_DISCOVERY: AuthSessionTypes.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};
const FACEBOOK_DISCOVERY: AuthSessionTypes.DiscoveryDocument = {
  authorizationEndpoint: 'https://www.facebook.com/v25.0/dialog/oauth',
  tokenEndpoint: 'https://graph.facebook.com/v25.0/oauth/access_token',
};

/** The `params` of a successful auth session; throws SocialCancelledError if the person backed out. */
function successParams(result: AuthSessionTypes.AuthSessionResult): Record<string, string> {
  if (result.type === 'success') return result.params;
  if (result.type === 'error') throw new Error(result.error?.message ?? 'Sign-in failed');
  throw new SocialCancelledError();
}

/** Whether Google can be offered on this platform with the current config. */
export function isGoogleConfigured(): boolean {
  return !!googleClientIdForPlatform();
}

export async function signInWithGoogle(): Promise<SocialCredential> {
  const clientId = googleClientIdForPlatform();
  if (!clientId) throw new SocialUnavailableError('GOOGLE');
  const { AuthSession, Crypto } = await loadAuthModules();

  if (Platform.OS === 'web') {
    // Web clients can't do a secret-less code exchange, so use the implicit ID-token flow.
    const request = new AuthSession.AuthRequest({
      clientId,
      redirectUri: AuthSession.makeRedirectUri(),
      scopes: ['openid', 'profile', 'email'],
      responseType: AuthSession.ResponseType.IdToken,
      usePKCE: false,
      extraParams: { nonce: Crypto.randomUUID() },
    });
    const result = await request.promptAsync(GOOGLE_DISCOVERY);
    const idToken = successParams(result).id_token;
    if (!idToken) throw new Error('Google did not return an ID token');
    return { provider: 'GOOGLE', credential: idToken };
  }

  // Native (iOS): authorization-code + PKCE, exchanged for an ID token.
  const redirectUri = googleIosRedirectUri(clientId);
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: ['openid', 'profile', 'email'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });
  const result = await request.promptAsync(GOOGLE_DISCOVERY);
  const params = successParams(result);
  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: params.code,
      redirectUri,
      extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
    },
    GOOGLE_DISCOVERY,
  );
  if (!token.idToken) throw new Error('Google did not return an ID token');
  return { provider: 'GOOGLE', credential: token.idToken };
}

/** Sign in with Apple is iOS-only in v1 (Services-ID web flow isn't set up). */
export async function isAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const Apple = await import('expo-apple-authentication');
    return await Apple.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<SocialCredential> {
  if (Platform.OS !== 'ios') throw new SocialUnavailableError('APPLE');
  const Apple = await import('expo-apple-authentication');
  try {
    const cred = await Apple.signInAsync({
      requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
    });
    if (!cred.identityToken) throw new Error('Apple did not return an identity token');
    const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ').trim();
    return { provider: 'APPLE', credential: cred.identityToken, displayName: name || undefined };
  } catch (err) {
    if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new SocialCancelledError();
    throw err;
  }
}

/**
 * Whether Facebook can be offered on this device. Web always can; iOS only
 * when this build registered the server's App ID as its "fb<id>" URL scheme
 * (Facebook won't redirect back to an unregistered/custom scheme); Android
 * isn't set up yet.
 */
export function isFacebookUsable(serverAppId: string): boolean {
  if (Platform.OS === 'web') return true;
  if (Platform.OS === 'ios') return facebookNativeAppId() === serverAppId;
  return false;
}

export async function signInWithFacebook(appId: string): Promise<SocialCredential> {
  const { AuthSession } = await loadAuthModules();
  const request = new AuthSession.AuthRequest({
    clientId: appId,
    redirectUri:
      Platform.OS === 'web' ? AuthSession.makeRedirectUri() : facebookNativeRedirectUri(appId),
    scopes: ['public_profile', 'email'],
    responseType: AuthSession.ResponseType.Token,
    usePKCE: false,
    extraParams: { display: 'popup' },
  });
  const result = await request.promptAsync(FACEBOOK_DISCOVERY);
  const accessToken = successParams(result).access_token;
  if (!accessToken) throw new Error('Facebook did not return an access token');
  return { provider: 'FACEBOOK', credential: accessToken };
}
