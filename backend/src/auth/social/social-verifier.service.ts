import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from 'crypto';
import { AppConfigService } from '../../config/config.service';

export type SocialProvider = 'GOOGLE' | 'APPLE' | 'FACEBOOK';

/** What a provider vouched for — the only thing the rest of the app trusts. */
export interface SocialProfile {
  provider: SocialProvider;
  /** The provider's own immutable user id (OIDC `sub` / Facebook `id`). */
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface SocialProviderAvailability {
  google: { enabled: boolean; clientIds: string[] };
  apple: { enabled: boolean; clientIds: string[] };
  facebook: { enabled: boolean; appId: string | null };
}

interface Jwk extends JsonWebKey {
  kid?: string;
}

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const JWKS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;

/**
 * Verifies the credential a mobile/web client got from Google, Apple or
 * Facebook, entirely server-side: the client's claim about who it is never
 * counts, only what the provider's own signature (or Graph API) confirms.
 *
 * Google/Apple hand back an OIDC ID token — a JWT signed RS256 with a key
 * published in the provider's JWKS. Verified here with node:crypto (no JWT
 * library: the common ones are ESM-only now and this backend is CommonJS).
 * Facebook hands back an access token, checked through Graph's debug_token
 * so a token minted for a *different* app can't be replayed here.
 */
@Injectable()
export class SocialVerifierService {
  private readonly jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

  constructor(private readonly config: AppConfigService) {}

  availability(): SocialProviderAvailability {
    const google = this.config.googleClientIds;
    const apple = this.config.appleClientIds;
    const fbId = this.config.facebookAppId;
    return {
      google: { enabled: google.length > 0, clientIds: google },
      apple: { enabled: apple.length > 0, clientIds: apple },
      facebook: { enabled: !!fbId && !!this.config.facebookAppSecret, appId: fbId ?? null },
    };
  }

  async verify(provider: SocialProvider, credential: string): Promise<SocialProfile> {
    switch (provider) {
      case 'GOOGLE':
        return this.verifyGoogle(credential);
      case 'APPLE':
        return this.verifyApple(credential);
      case 'FACEBOOK':
        return this.verifyFacebook(credential);
      default:
        throw new BadRequestException('Unsupported sign-in provider');
    }
  }

  private async verifyGoogle(idToken: string): Promise<SocialProfile> {
    const audiences = this.config.googleClientIds;
    if (audiences.length === 0) throw new ServiceUnavailableException('Google sign-in is not configured');
    const claims = await this.verifyOidcToken(idToken, GOOGLE_JWKS_URL, GOOGLE_ISSUERS, audiences);
    return {
      provider: 'GOOGLE',
      subject: String(claims.sub),
      email: typeof claims.email === 'string' ? claims.email.toLowerCase() : null,
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
      name: typeof claims.name === 'string' ? claims.name : null,
    };
  }

  private async verifyApple(idToken: string): Promise<SocialProfile> {
    const audiences = this.config.appleClientIds;
    if (audiences.length === 0) throw new ServiceUnavailableException('Apple sign-in is not configured');
    const claims = await this.verifyOidcToken(idToken, APPLE_JWKS_URL, [APPLE_ISSUER], audiences);
    return {
      provider: 'APPLE',
      subject: String(claims.sub),
      email: typeof claims.email === 'string' ? claims.email.toLowerCase() : null,
      // Apple sends email_verified as the STRING "true" in some token versions.
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
      // Apple never puts the name in the token; the client forwards it separately (first sign-in only).
      name: null,
    };
  }

  private async verifyFacebook(accessToken: string): Promise<SocialProfile> {
    const appId = this.config.facebookAppId;
    const appSecret = this.config.facebookAppSecret;
    if (!appId || !appSecret) throw new ServiceUnavailableException('Facebook sign-in is not configured');

    const debug = (await this.fetchJson(
      `https://graph.facebook.com/debug_token?${new URLSearchParams({
        input_token: accessToken,
        access_token: `${appId}|${appSecret}`,
      }).toString()}`,
    )) as { data?: { is_valid?: boolean; app_id?: string; user_id?: string } };
    if (!debug.data?.is_valid || debug.data.app_id !== appId || !debug.data.user_id) {
      throw new UnauthorizedException('Invalid Facebook sign-in');
    }

    const me = (await this.fetchJson(
      `https://graph.facebook.com/v25.0/me?${new URLSearchParams({
        fields: 'id,name,email',
        access_token: accessToken,
      }).toString()}`,
    )) as { id?: string; name?: string; email?: string };
    if (!me.id || me.id !== debug.data.user_id) throw new UnauthorizedException('Invalid Facebook sign-in');

    return {
      provider: 'FACEBOOK',
      subject: me.id,
      email: me.email ? me.email.toLowerCase() : null,
      // Graph only returns an email the person has confirmed with Facebook.
      emailVerified: !!me.email,
      name: me.name ?? null,
    };
  }

  /** Verifies an RS256 OIDC ID token against a provider JWKS; returns its claims. */
  async verifyOidcToken(
    token: string,
    jwksUrl: string,
    issuers: string[],
    audiences: string[],
    nowSeconds: number = Math.floor(Date.now() / 1000),
  ): Promise<Record<string, unknown>> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Invalid sign-in token');
    let header: { alg?: string; kid?: string };
    let claims: Record<string, unknown>;
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid sign-in token');
    }
    // Pin the algorithm: never trust the token's own header to pick `none`/HS256.
    if (header.alg !== 'RS256' || !header.kid) throw new UnauthorizedException('Invalid sign-in token');

    const jwk = await this.findKey(jwksUrl, header.kid);
    if (!jwk) throw new UnauthorizedException('Invalid sign-in token');

    let signatureOk = false;
    try {
      signatureOk = cryptoVerify(
        'RSA-SHA256',
        Buffer.from(`${parts[0]}.${parts[1]}`),
        createPublicKey({ key: jwk, format: 'jwk' }),
        Buffer.from(parts[2], 'base64url'),
      );
    } catch {
      signatureOk = false;
    }
    if (!signatureOk) throw new UnauthorizedException('Invalid sign-in token');

    const aud = Array.isArray(claims.aud) ? (claims.aud as unknown[]) : [claims.aud];
    if (!issuers.includes(String(claims.iss)) || !aud.some((a) => audiences.includes(String(a)))) {
      throw new UnauthorizedException('Invalid sign-in token');
    }
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) {
      throw new UnauthorizedException('Sign-in token expired');
    }
    if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_SECONDS > nowSeconds) {
      throw new UnauthorizedException('Invalid sign-in token');
    }
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      throw new UnauthorizedException('Invalid sign-in token');
    }
    return claims;
  }

  private async findKey(jwksUrl: string, kid: string): Promise<Jwk | undefined> {
    const cached = this.jwksCache.get(jwksUrl);
    const fresh = cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS;
    let key = fresh ? cached.keys.find((k) => k.kid === kid) : undefined;
    if (!key) {
      // Unknown kid or stale cache: providers rotate keys, so refetch once.
      const doc = (await this.fetchJson(jwksUrl)) as { keys?: Jwk[] };
      const keys = doc.keys ?? [];
      this.jwksCache.set(jwksUrl, { keys, fetchedAt: Date.now() });
      key = keys.find((k) => k.kid === kid);
    }
    return key;
  }

  /** Overridable seam for tests. */
  protected async fetchJson(url: string): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new ServiceUnavailableException('Could not reach the sign-in provider');
    }
    if (!res.ok) throw new UnauthorizedException('Sign-in provider rejected the request');
    return res.json();
  }
}
