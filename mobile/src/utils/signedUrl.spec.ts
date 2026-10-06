import { signedUrlExpiresAt } from './signedUrl';

describe('signedUrlExpiresAt', () => {
  it('reads the expiry from a presigned URL', () => {
    const url =
      'https://bucket.r2.cloudflarestorage.com/avatars/u1.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20261006T140000Z&X-Amz-Expires=3600&X-Amz-Signature=abc';
    expect(signedUrlExpiresAt(url)).toBe(Date.UTC(2026, 9, 6, 15, 0, 0));
  });

  it('returns null for a plain URL or no URL', () => {
    expect(signedUrlExpiresAt('https://cdn.example.com/a.jpg')).toBeNull();
    expect(signedUrlExpiresAt(null)).toBeNull();
    expect(signedUrlExpiresAt(undefined)).toBeNull();
  });
});
