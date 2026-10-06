/**
 * When an S3/R2 presigned URL stops working, read from its own query string
 * (`X-Amz-Date` + `X-Amz-Expires`). Null for any other kind of URL.
 */
export function signedUrlExpiresAt(url: string | null | undefined): number | null {
  if (!url) return null;
  const date = /[?&]X-Amz-Date=(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/i.exec(url);
  const seconds = /[?&]X-Amz-Expires=(\d+)/i.exec(url);
  if (!date || !seconds) return null;
  const [, y, mo, d, h, mi, s] = date;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) + Number(seconds[1]) * 1000;
}
