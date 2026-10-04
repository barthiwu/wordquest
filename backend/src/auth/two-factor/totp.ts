import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30 s step) — the profile every
 * authenticator app (Google Authenticator, Authy, 1Password, Microsoft
 * Authenticator…) speaks. Dependency-free on purpose: it's ~40 lines over
 * node:crypto, and the popular packages are moving to ESM-only builds that
 * this CommonJS backend can't `require`.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A fresh 160-bit shared secret, base32-encoded (what authenticator apps and QR codes carry). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The 6-digit code for the 30-second step containing `atMs`. */
export function totpCode(secretBase32: string, atMs: number = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / TOTP_STEP_SECONDS);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/**
 * Accepts the current step plus `window` steps either side (default ±1 =
 * ±30 s) to forgive phone/server clock drift. Constant-time comparison.
 * Returns the matched step counter (so callers can reject replays of an
 * already-used step) or null.
 */
export function verifyTotp(
  secretBase32: string,
  submitted: string,
  atMs: number = Date.now(),
  window = 1,
): number | null {
  const code = submitted.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) return null;
  const currentStep = Math.floor(atMs / 1000 / TOTP_STEP_SECONDS);
  for (let delta = -window; delta <= window; delta++) {
    const expected = totpCode(secretBase32, (currentStep + delta) * TOTP_STEP_SECONDS * 1000);
    const a = Buffer.from(expected);
    const b = Buffer.from(code);
    if (a.length === b.length && timingSafeEqual(a, b)) return currentStep + delta;
  }
  return null;
}

/** The otpauth:// URI authenticator apps import (the QR code's payload). */
export function otpauthUrl(params: { secret: string; accountName: string; issuer: string }): string {
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(params.accountName)}`;
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
