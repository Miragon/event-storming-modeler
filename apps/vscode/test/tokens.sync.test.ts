import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHELL, SHELL_TOKENS, shellSizesFromTokens } from '@miragon/modeler-shell/core';

/**
 * The shell computes fit insets, breakpoints and layers from its own copy of the design system's
 * sizes (`SHELL`), while its stylesheet reads the `--cd-shell-*` tokens this repository vendors.
 * Both must be the same numbers, or the fit and the CSS disagree by a few pixels.
 */
const vendoredTokens = JSON.parse(
  readFileSync(
    new URL('../../../packages/renderer/src/theme/cd-tokens.generated.json', import.meta.url),
    'utf8',
  ),
) as { shell: Record<string, string> };

describe('the vendored tokens and @miragon/modeler-shell', () => {
  it('the shell sizes equal the vendored `shell` tokens', () => {
    expect(SHELL).toEqual(shellSizesFromTokens(vendoredTokens.shell));
  });

  it('the vendored tokens define every size the shell stylesheet reads', () => {
    expect(Object.keys(vendoredTokens.shell)).toEqual(
      expect.arrayContaining(Object.values(SHELL_TOKENS)),
    );
  });
});
