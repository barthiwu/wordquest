import { bytesToBase64 } from './base64';

const bytes = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'));

describe('bytesToBase64', () => {
  it('matches the standard test vectors, including padding', () => {
    expect(bytesToBase64(bytes(''))).toBe('');
    expect(bytesToBase64(bytes('f'))).toBe('Zg==');
    expect(bytesToBase64(bytes('fo'))).toBe('Zm8=');
    expect(bytesToBase64(bytes('foo'))).toBe('Zm9v');
    expect(bytesToBase64(bytes('foob'))).toBe('Zm9vYg==');
    expect(bytesToBase64(bytes('fooba'))).toBe('Zm9vYmE=');
    expect(bytesToBase64(bytes('foobar'))).toBe('Zm9vYmFy');
  });

  it('agrees with Buffer for every byte value and for a long run', () => {
    const all = new Uint8Array(256).map((_, i) => i);
    expect(bytesToBase64(all)).toBe(Buffer.from(all).toString('base64'));
    const long = new Uint8Array(10_007).map((_, i) => (i * 31 + 7) % 256);
    expect(bytesToBase64(long)).toBe(Buffer.from(long).toString('base64'));
  });

  it('keeps the UTF-8 byte-order mark of a CSV intact', () => {
    const csv = new TextEncoder().encode('﻿Rank,Player');
    expect(bytesToBase64(csv)).toBe(Buffer.from(csv).toString('base64'));
    expect(bytesToBase64(csv).startsWith('77u/')).toBe(true);
  });
});
