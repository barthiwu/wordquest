import { base32Decode, base32Encode, generateTotpSecret, otpauthUrl, totpCode, verifyTotp } from './totp';

// RFC 6238 Appendix B test vectors (SHA-1 secret "12345678901234567890"), last 6 of the 8-digit values.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  it('matches the RFC 6238 SHA-1 test vectors', () => {
    expect(totpCode(RFC_SECRET, 59_000)).toBe('287082');
    expect(totpCode(RFC_SECRET, 1_111_111_109_000)).toBe('081804');
    expect(totpCode(RFC_SECRET, 1_111_111_111_000)).toBe('050471');
    expect(totpCode(RFC_SECRET, 1_234_567_890_000)).toBe('005924');
    expect(totpCode(RFC_SECRET, 2_000_000_000_000)).toBe('279037');
  });

  it('round-trips base32', () => {
    const buf = Buffer.from([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
    expect(() => base32Decode('not*base32')).toThrow();
  });

  it('generates a 32-char secret', () => {
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('verifies the current step and ±1 but not further out', () => {
    const t = 1_700_000_000_000;
    const code = totpCode(RFC_SECRET, t);
    expect(verifyTotp(RFC_SECRET, code, t)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, code, t + 30_000)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, code, t - 30_000)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, code, t + 90_000)).toBeNull();
  });

  it('rejects malformed and wrong codes, tolerates spaces', () => {
    const t = 1_700_000_000_000;
    const code = totpCode(RFC_SECRET, t);
    expect(verifyTotp(RFC_SECRET, '12345', t)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', t)).toBeNull();
    expect(verifyTotp(RFC_SECRET, code === '000000' ? '000001' : '000000', t)).toBeNull();
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, t)).not.toBeNull();
  });

  it('builds an otpauth URL', () => {
    const url = otpauthUrl({ secret: 'ABC', accountName: 'ada@example.com', issuer: 'WordQuest' });
    expect(url).toBe(
      'otpauth://totp/WordQuest:ada%40example.com?secret=ABC&issuer=WordQuest&algorithm=SHA1&digits=6&period=30',
    );
  });
});
