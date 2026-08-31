import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  encodeMap,
  decodeMap,
  encodeMapCompressed,
  decodeMapCompressed,
  readHashMap,
  shareUrl,
} from '../src/share.js';

/**
 * Characterization tests for the webapp share/URL codec (base64 + deflate-raw compression + the
 * `#mz=`/`#m=` hash round-trip). The golden values lock the exact wire format of share links.
 */

const ORDER_CHECKOUT = `title Order Checkout
actor Customer [80, 300]
command Place Order [240, 300]
event Order Placed [620, 300]
Customer -> Place Order`;

function stubLocation(location: { hash?: string; origin?: string; pathname?: string }): void {
  vi.stubGlobal('location', {
    hash: location.hash ?? '',
    origin: location.origin ?? 'https://event-storming.example',
    pathname: location.pathname ?? '/',
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('encodeMap / decodeMap (uncompressed, URL-safe base64)', () => {
  it('round-trips UTF-8', () => {
    expect(decodeMap(encodeMap(ORDER_CHECKOUT))).toBe(ORDER_CHECKOUT);
  });

  it.each([
    ['title Order Checkout', 'dGl0bGUgT3JkZXIgQ2hlY2tvdXQ'],
    ['x', 'eA'],
    ['ÿÿÿ????>>>>', 'w7_Dv8O_Pz8_Pz4-Pj4'],
  ])('encodes %j to the exact golden %j', (text, golden) => {
    expect(encodeMap(text)).toBe(golden);
    expect(decodeMap(golden)).toBe(text);
  });
});

describe('encodeMapCompressed / decodeMapCompressed (deflate-raw)', () => {
  it('round-trips', async () => {
    const encoded = await encodeMapCompressed(ORDER_CHECKOUT);
    expect(await decodeMapCompressed(encoded)).toBe(ORDER_CHECKOUT);
  });

  it('shrinks a repetitive real-world board', async () => {
    const big = ORDER_CHECKOUT.repeat(20);
    const compressed = await encodeMapCompressed(big);
    const uncompressed = encodeMap(big);
    expect(compressed.length).toBeLessThan(uncompressed.length);
  });

  it('emits only URL-safe characters', async () => {
    expect(await encodeMapCompressed(ORDER_CHECKOUT)).not.toMatch(/[+/=]/);
  });
});

describe('readHashMap', () => {
  it('reads a compressed (#mz=) hash', async () => {
    const payload = await encodeMapCompressed(ORDER_CHECKOUT);
    stubLocation({ hash: `#mz=${payload}` });
    expect(await readHashMap()).toBe(ORDER_CHECKOUT);
  });

  it('reads a legacy uncompressed (#m=) hash', async () => {
    stubLocation({ hash: `#m=${encodeMap(ORDER_CHECKOUT)}` });
    expect(await readHashMap()).toBe(ORDER_CHECKOUT);
  });

  it('returns null for no hash', async () => {
    stubLocation({ hash: '' });
    expect(await readHashMap()).toBeNull();
  });

  it('returns null for an unrelated hash', async () => {
    stubLocation({ hash: '#section-2' });
    expect(await readHashMap()).toBeNull();
  });

  it('returns null (swallows the error) for a malformed compressed payload', async () => {
    stubLocation({ hash: '#mz=not-valid-deflate-data' });
    expect(await readHashMap()).toBeNull();
  });
});

describe('shareUrl', () => {
  it('builds origin + pathname + #mz= + compressed payload', async () => {
    stubLocation({ origin: 'https://event-storming.example', pathname: '/editor' });
    const url = await shareUrl(ORDER_CHECKOUT);
    expect(url.startsWith('https://event-storming.example/editor#mz=')).toBe(true);
    // The payload must decode back to the original board.
    const payload = url.slice(url.indexOf('#mz=') + '#mz='.length);
    expect(await decodeMapCompressed(payload)).toBe(ORDER_CHECKOUT);
  });
});
