import { generateKeyPairSync, sign, type JsonWebKey } from 'crypto';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { SocialVerifierService } from './social-verifier.service';
import type { AppConfigService } from '../../config/config.service';

const GOOGLE_CLIENT = 'google-client.apps.googleusercontent.com';
const NOW = 1_800_000_000;

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: 'jwk' }) as JsonWebKey), kid: 'k1', alg: 'RS256', use: 'sig' };

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function makeToken(claims: Record<string, unknown>, opts: { key?: typeof privateKey; alg?: string; kid?: string } = {}) {
  const header = b64({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' });
  const body = b64(claims);
  const sig = sign('RSA-SHA256', Buffer.from(`${header}.${body}`), opts.key ?? privateKey).toString('base64url');
  return `${header}.${body}.${sig}`;
}

class TestVerifier extends SocialVerifierService {
  fetched: string[] = [];
  responses: Record<string, unknown> = {};
  protected override async fetchJson(url: string): Promise<unknown> {
    this.fetched.push(url);
    const hit = Object.keys(this.responses).find((k) => url.startsWith(k));
    if (!hit) throw new Error(`unexpected fetch ${url}`);
    return this.responses[hit];
  }
}

function build(overrides: Partial<Record<string, unknown>> = {}) {
  const config = {
    googleClientIds: [GOOGLE_CLIENT],
    appleClientIds: ['com.wordquest.app'],
    facebookAppId: 'fb-app',
    facebookAppSecret: 'fb-secret',
    ...overrides,
  } as unknown as AppConfigService;
  const svc = new TestVerifier(config);
  svc.responses['https://www.googleapis.com/oauth2/v3/certs'] = { keys: [jwk] };
  svc.responses['https://appleid.apple.com/auth/keys'] = { keys: [jwk] };
  return svc;
}

describe('SocialVerifierService', () => {
  const claims = {
    iss: 'https://accounts.google.com',
    aud: GOOGLE_CLIENT,
    sub: 'g-1',
    email: 'Ada@Example.com',
    email_verified: true,
    name: 'Ada',
    exp: NOW + 600,
  };
  const verifyGoogle = (svc: SocialVerifierService, token: string) =>
    svc.verifyOidcToken(token, 'https://www.googleapis.com/oauth2/v3/certs', ['https://accounts.google.com'], [GOOGLE_CLIENT], NOW);

  it('accepts a correctly signed token and returns claims', async () => {
    const out = await verifyGoogle(build(), makeToken(claims));
    expect(out.sub).toBe('g-1');
  });

  it('rejects a token signed by a different key', async () => {
    await expect(verifyGoogle(build(), makeToken(claims, { key: other.privateKey }))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects alg=none / HS256 headers', async () => {
    await expect(verifyGoogle(build(), makeToken(claims, { alg: 'none' }))).rejects.toThrow(UnauthorizedException);
    await expect(verifyGoogle(build(), makeToken(claims, { alg: 'HS256' }))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects wrong audience, wrong issuer and expired tokens', async () => {
    const svc = build();
    await expect(verifyGoogle(svc, makeToken({ ...claims, aud: 'someone-else' }))).rejects.toThrow(UnauthorizedException);
    await expect(verifyGoogle(svc, makeToken({ ...claims, iss: 'https://evil.example' }))).rejects.toThrow(UnauthorizedException);
    await expect(verifyGoogle(svc, makeToken({ ...claims, exp: NOW - 3600 }))).rejects.toThrow(/expired/i);
  });

  it('rejects an unknown kid after refetching the JWKS once', async () => {
    const svc = build();
    await expect(verifyGoogle(svc, makeToken(claims, { kid: 'nope' }))).rejects.toThrow(UnauthorizedException);
  });

  it('caches the JWKS between verifications', async () => {
    const svc = build();
    await verifyGoogle(svc, makeToken(claims));
    await verifyGoogle(svc, makeToken(claims));
    expect(svc.fetched).toHaveLength(1);
  });

  it('maps a Google token into a normalised profile (via verify())', async () => {
    const svc = build();
    // verify() uses the real clock, so mint a token valid "now".
    const exp = Math.floor(Date.now() / 1000) + 600;
    const profile = await svc.verify('GOOGLE', makeToken({ ...claims, exp }));
    expect(profile).toEqual({ provider: 'GOOGLE', subject: 'g-1', email: 'ada@example.com', emailVerified: true, name: 'Ada' });
  });

  it('treats Apple string "true" email_verified as verified', async () => {
    const svc = build();
    const exp = Math.floor(Date.now() / 1000) + 600;
    const profile = await svc.verify(
      'APPLE',
      makeToken({ iss: 'https://appleid.apple.com', aud: 'com.wordquest.app', sub: 'a-1', email: 'a@b.co', email_verified: 'true', exp }),
    );
    expect(profile.emailVerified).toBe(true);
    expect(profile.provider).toBe('APPLE');
  });

  it('reports providers as unavailable when unconfigured', async () => {
    const svc = build({ googleClientIds: [], facebookAppId: undefined });
    expect(svc.availability().google.enabled).toBe(false);
    expect(svc.availability().facebook.enabled).toBe(false);
    await expect(svc.verify('GOOGLE', 'x.y.z')).rejects.toThrow(ServiceUnavailableException);
  });

  describe('Facebook', () => {
    const debugUrl = 'https://graph.facebook.com/debug_token';
    const meUrl = 'https://graph.facebook.com/v19.0/me';

    it('accepts a valid token for this app', async () => {
      const svc = build();
      svc.responses[debugUrl] = { data: { is_valid: true, app_id: 'fb-app', user_id: 'f-1' } };
      svc.responses[meUrl] = { id: 'f-1', name: 'Fay', email: 'Fay@x.com' };
      expect(await svc.verify('FACEBOOK', 'tok')).toEqual({
        provider: 'FACEBOOK', subject: 'f-1', email: 'fay@x.com', emailVerified: true, name: 'Fay',
      });
    });

    it('rejects a token minted for another app', async () => {
      const svc = build();
      svc.responses[debugUrl] = { data: { is_valid: true, app_id: 'other-app', user_id: 'f-1' } };
      await expect(svc.verify('FACEBOOK', 'tok')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when /me id does not match the debugged user', async () => {
      const svc = build();
      svc.responses[debugUrl] = { data: { is_valid: true, app_id: 'fb-app', user_id: 'f-1' } };
      svc.responses[meUrl] = { id: 'f-2' };
      await expect(svc.verify('FACEBOOK', 'tok')).rejects.toThrow(UnauthorizedException);
    });
  });
});
