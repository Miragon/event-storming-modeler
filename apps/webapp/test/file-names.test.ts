import { describe, expect, it } from 'vitest';
import { boardFileName } from '../src/file-names.js';

describe('boardFileName', () => {
  it('names a download after the board’s title', () => {
    expect(boardFileName('Order Checkout', 'png')).toBe('order-checkout.png');
    expect(boardFileName('Order Checkout', 'storm')).toBe('order-checkout.storm');
    expect(boardFileName('Order Checkout', 'png-transparent')).toBe(
      'order-checkout-transparent@4x.png',
    );
  });

  it('falls back to a generic name for a title the app set itself', () => {
    expect(boardFileName('New board', 'json')).toBe('event-storming-board.json');
    expect(boardFileName(undefined, 'svg')).toBe('event-storming-board.svg');
    expect(boardFileName('  ', 'svg')).toBe('event-storming-board.svg');
    expect(boardFileName('!!!', 'svg')).toBe('event-storming-board.svg');
  });

  it('writes ASCII: umlauts lose their marks, ß becomes ss, the length is capped', () => {
    expect(boardFileName('Größe & Übergabe', 'png')).toBe('grosse-ubergabe.png');
    expect(boardFileName('a'.repeat(80), 'png')).toBe(`${'a'.repeat(60)}.png`);
  });
});
