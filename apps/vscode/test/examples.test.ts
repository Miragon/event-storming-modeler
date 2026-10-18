import { describe, expect, it } from 'vitest';
import { parseDSLWithDiagnostics } from '@miragon/event-storming-dsl';
import { EMPTY_BOARD, EXAMPLE_BOARD, withExampleInserted } from '../src/examples.js';

const EXAMPLE_ELEMENT_COUNT = parseDSLWithDiagnostics(EXAMPLE_BOARD).board.elements.length;

describe('examples', () => {
  it('ships an empty board without elements and an example without findings', () => {
    expect(parseDSLWithDiagnostics(EMPTY_BOARD).board.elements).toEqual([]);
    expect(parseDSLWithDiagnostics(EXAMPLE_BOARD).diagnostics).toEqual([]);
    expect(EXAMPLE_ELEMENT_COUNT).toBeGreaterThan(0);
  });
});

describe('withExampleInserted', () => {
  it('keeps the title and comments and appends the example after a blank line', () => {
    const document = '# workshop 2026-10-18\ntitle Checkout\nlevel process\n';

    const result = withExampleInserted(document);

    expect(result.startsWith(`${document}\n`)).toBe(true);
    const { board, diagnostics } = parseDSLWithDiagnostics(result);
    expect(diagnostics).toEqual([]);
    expect(board.config.title).toBe('Checkout');
    expect(board.config.level).toBe('process');
    expect(board.elements).toHaveLength(EXAMPLE_ELEMENT_COUNT);
    expect(result).not.toContain('Order Checkout');
  });

  it('appends the arrows too', () => {
    const result = withExampleInserted(EMPTY_BOARD);

    expect(result).toContain('Customer -> Place Order\n');
    expect(result.endsWith('#agg_order_2 -> Order Shipped\n')).toBe(true);
  });

  it('adds the missing line break of a last line', () => {
    expect(withExampleInserted('title Checkout').startsWith('title Checkout\n\nactor ')).toBe(true);
  });

  it('does not double an existing blank line', () => {
    expect(withExampleInserted('title Checkout\n\n').startsWith('title Checkout\n\nactor ')).toBe(
      true,
    );
  });

  it('starts an empty file with the example content', () => {
    expect(withExampleInserted('').startsWith('actor Customer')).toBe(true);
  });

  it('follows the CRLF line breaks of the document', () => {
    const result = withExampleInserted('title Checkout\r\n');

    expect(result.startsWith('title Checkout\r\n\r\nactor ')).toBe(true);
    expect(result.replace(/\r\n/g, '')).not.toContain('\n');
  });
});
