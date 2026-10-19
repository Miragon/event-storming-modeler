import { describe, expect, it } from 'vitest';
import { EXAMPLE_BOARD as EXTENSION_EXAMPLE } from '../../vscode/src/examples.js';
import { EXAMPLE_BOARD } from '../src/example.js';

describe('EXAMPLE_BOARD', () => {
  it('is the VS Code extension’s example: one board behind "Show example" and "Insert example"', () => {
    expect(EXAMPLE_BOARD.trimEnd()).toBe(EXTENSION_EXAMPLE.trimEnd());
  });
});
