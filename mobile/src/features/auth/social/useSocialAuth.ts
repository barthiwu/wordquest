import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/services/apiClient';
import {
  getSocialProviders,
  isDobRequiredError,
  isTwoFactorChallenge,
  socialLogin,
  type AuthResult,
  type LoginResult,
  type SocialProvider,
} from '@/services/auth';
import {
  SocialCancelledError,
  isAppleAvailable,
  isGoogleConfigured,
  signInWithApple,
  signInWithFacebook,
  signInWithGoogle,
  type SocialCredential,
} from './socialSignIn';

export interface UseSocialAuthOptions {
  /** A finished session (no 2FA needed). */
  onSession: (result: AuthResult) => void | Promise<void>;
  /** The account has two-step verification on: continue with this challenge. */
  onChallenge: (challengeToken: string) => void;
  /** Birthdate already collected by the surrounding screen (Registration), sent up front for new accounts. */
  dateOfBirth?: string;
}

/**
 * Drives "Continue with Google / Apple / Facebook": which providers to
 * offer (server-configured AND usable on this device), the provider
 * handshake, the exchange with POST /auth/social, and the two follow-ups
 * the server can ask for — a birthdate (new accounts) or a 2FA code.
 */
export function useSocialAuth({ onSession, onChallenge, dateOfBirth }: UseSocialAuthOptions) {
  const { t } = useTranslation('auth');
  const [available, setAvailable] = useState<SocialProvider[]>([]);
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<SocialCredential | null>(null);
  const facebookAppId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await getSocialProviders();
        const list: SocialProvider[] = [];
        if (info.google.enabled && isGoogleConfigured()) list.push('GOOGLE');
        if (info.apple.enabled && (await isAppleAvailable())) list.push('APPLE');
        if (info.facebook.enabled && info.facebook.appId) {
          facebookAppId.current = info.facebook.appId;
          list.push('FACEBOOK');
        }
        if (!cancelled) setAvailable(list);
      } catch {
        // Server unreachable or older: just don't offer social sign-in.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = useCallback(
    async (result: LoginResult) => {
      if (isTwoFactorChallenge(result)) onChallenge(result.challengeToken);
      else await onSession(result);
    },
    [onChallenge, onSession],
  );

  const exchange = useCallback(
    async (credential: SocialCredential, dob?: string) => {
      try {
        const result = await socialLogin({ ...credential, dateOfBirth: dob ?? dateOfBirth });
        setPending(null);
        await finish(result);
      } catch (err) {
        if (err instanceof ApiError && isDobRequiredError(err.body)) {
          setPending(credential);
          return;
        }
        setPending(null);
        throw err;
      }
    },
    [dateOfBirth, finish],
  );

  const messageFor = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && (err.status === 400 || err.status === 401 || err.status === 409)) {
        return err.message || t('social.errorGeneric');
      }
      return t('social.errorGeneric');
    },
    [t],
  );

  const start = useCallback(
    async (provider: SocialProvider) => {
      if (busy) return;
      setBusy(provider);
      setError(null);
      try {
        const credential =
          provider === 'GOOGLE'
            ? await signInWithGoogle()
            : provider === 'APPLE'
              ? await signInWithApple()
              : await signInWithFacebook(facebookAppId.current ?? '');
        await exchange(credential);
      } catch (err) {
        if (!(err instanceof SocialCancelledError)) setError(messageFor(err));
      } finally {
        setBusy(null);
      }
    },
    [busy, exchange, messageFor],
  );

  /** Retry the pending sign-in with the birthdate the person just entered. */
  const submitDob = useCallback(
    async (dob: string) => {
      if (!pending) return;
      setBusy(pending.provider);
      setError(null);
      try {
        await exchange(pending, dob);
      } catch (err) {
        setError(messageFor(err));
      } finally {
        setBusy(null);
      }
    },
    [exchange, messageFor, pending],
  );

  const cancelDob = useCallback(() => {
    setPending(null);
    setError(null);
  }, []);

  return { available, busy, error, needsDob: pending !== null, start, submitDob, cancelDob };
}
