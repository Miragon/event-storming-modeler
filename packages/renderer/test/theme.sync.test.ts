import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MIRAGON } from '../src/theme/palette.js';

/**
 * Drift guard: `assets/event-storming.css` reads the design-system roles only, and `MIRAGON`
 * mirrors the design-system tokens vendored in `theme/`. This test fails the moment the CSS
 * declares a colour of its own, the TS source of truth drifts or a partial re-copy of the vendored
 * files diverges, so the "keep these in sync" contract is enforced instead of hoped for. See the
 * Miragon design system (the `miragon-brand:modeler-tool-design` skill; CLAUDE.md
 * § "Design system").
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const css = readSource('../src/assets/event-storming.css');
const vendoredTokensCss = readSource('../src/theme/cd-tokens.generated.css');
const vendoredCanvasCss = readSource('../src/theme/cd-canvas.css');
const vendoredTokensJson = readSource('../src/theme/cd-tokens.generated.json');

interface VendoredTokens {
  $description: string;
  hell: Record<string, string>;
  dunkel: Record<string, string>;
  hochkontrast: { hell: Record<string, string>; dunkel: Record<string, string> };
  fest: Record<string, string>;
  shell: Record<string, string>;
}
const tokens = JSON.parse(vendoredTokensJson) as VendoredTokens;

const VENDORED_HEADER =
  '/* Vendored unchanged from Miragon/corporate-identity (design system 1.12.0, plugins/miragon-brand/skills/modeler-tool-design/assets). Do not edit; re-copy to update. */';

/**
 * Compare colours by meaning, not bytes: ignore hex case and `rgba(…)` whitespace (Prettier
 *  reformats the CSS, so a byte-exact match would be brittle). Real value drift still fails.
 */
function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pull `--name: value;` declarations out of the first rule whose selector list ends with
 * `selector` (tolerates combined lists like `a, b { … }`; assumes flat, un-nested token blocks).
 */
function readVars(source: string, selector: string, sourceName: string): Record<string, string> {
  const block = new RegExp(`${escapeForRegExp(selector)}\\s*\\{([^}]*)\\}`).exec(source);
  if (!block) throw new Error(`selector not found in ${sourceName}: ${selector}`);
  const vars: Record<string, string> = {};
  for (const match of block[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[match[1]!] = norm(match[2]!);
  }
  return vars;
}

function normalizedValues(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, norm(value)]));
}

/** Every `name: value` of `expected` is declared in `actual` with the same value. */
function expectDeclared(
  actual: Record<string, string>,
  expected: Record<string, string>,
  where: string,
): void {
  for (const [name, value] of Object.entries(expected)) {
    expect(actual[name], `${name} in ${where}`).toBe(norm(value));
  }
}

/** The CSS without comments: what the browser parses. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every selector of every rule (the text in front of a `{`, split at the commas). */
function ruleSelectors(source: string): string[] {
  return [...withoutComments(source).matchAll(/([^{};]+)\{/g)].flatMap((match) =>
    match[1]!.split(',').map((selector) => selector.trim()),
  );
}

describe('theme.sync — event-storming.css takes every colour from the roles', () => {
  it('declares no colour literal: no hex, rgb() or hsl() value', () => {
    expect(withoutComments(css)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it('reads only roles and mode-independent tokens, never a fixed palette colour', () => {
    const tokens = [...withoutComments(css).matchAll(/var\((--cd-[\w-]+)/g)].map((m) => m[1]!);
    expect(tokens.length).toBeGreaterThan(20);
    for (const token of tokens) {
      expect(token).toMatch(/^--cd-(ui-[\w-]+|radius-\w+|shadow-\d|ease(-out)?|motion-\w+)$/);
    }
  });

  it('never renders the DSL `style` directive (guide §10.7: no navy board)', () => {
    expect(
      ruleSelectors(css).filter((selector) => /event-storming-(dark|classic)/.test(selector)),
    ).toEqual([]);
    expect(withoutComments(css)).not.toMatch(/--event-storming-/);
  });

  it('keeps its own canvas overlays below the palette (guide §5.13)', () => {
    const zIndexOf = (selector: string): number => {
      const rule = new RegExp(`${escapeForRegExp(selector)}\\s*\\{([^}]*)\\}`).exec(
        withoutComments(css),
      );
      return Number(/z-index:\s*(\d+)/.exec(rule?.[1] ?? '')?.[1]);
    };
    expect(zIndexOf(".djs-palette:not([data-chrome='palette'])")).toBe(110);
    for (const overlay of [
      '.event-storming-container .event-storming-note-toolbar',
      '.event-storming-container .event-storming-color-picker',
      '.event-storming-container .event-storming-label-input',
    ]) {
      expect(zIndexOf(overlay), overlay).toBeLessThanOrEqual(100);
    }
  });
});

describe('theme.sync — event-storming.css wires the vendored design-system files', () => {
  it('starts with the tokens (layered), diagram-js and cd-canvas (unlayered), in this order', () => {
    const statements = withoutComments(css)
      .split(/;|\{/)
      .map((statement) => statement.trim().replace(/\s+/g, ' '));
    expect(statements.slice(0, 4)).toEqual([
      "@import '../theme/cd-tokens.generated.css' layer(event-storming-tokens)",
      "@import 'diagram-js/assets/diagram-js.css'",
      "@import '../theme/cd-canvas.css'",
      '.event-storming-container',
    ]);
    expect(css.match(/@import/g)).toHaveLength(3);
  });

  it('leaves the lasso fill and the resizer handles to cd-canvas.css (guide §10.4)', () => {
    expect(withoutComments(css)).not.toMatch(/--lasso-fill-color/);
    expect(
      ruleSelectors(css).filter((selector) => selector.includes('djs-resizer-visual')),
    ).toEqual([]);
  });

  it('draws the dot grid in --cd-ui-linie at 1px (guide §10.1)', () => {
    const container = /\.event-storming-container\s*\{([^}]*)\}/.exec(withoutComments(css));
    expect(container?.[1]).toMatch(
      /background-image:\s*radial-gradient\(var\(--cd-ui-linie\) 1px, transparent 1px\);/,
    );
  });

  it('marks hover and selection by the outline only, never by a filter (guide §10.4)', () => {
    const rules = withoutComments(css);
    expect(rules).not.toMatch(/brightness\(/);
    expect(rules).not.toMatch(/--element-selected-outline-secondary-stroke-color/);
    expect(ruleSelectors(css)).toContain(
      '.event-storming-container .djs-shape.hover > .djs-outline',
    );
  });

  it('scopes every rule of its own palette away from the shell skin', () => {
    const paletteSelectors = ruleSelectors(css).filter((selector) =>
      /\.djs-palette(?![\w-])/.test(selector),
    );
    expect(paletteSelectors.length).toBeGreaterThan(5);
    for (const selector of paletteSelectors) {
      expect(selector).toMatch(
        /^(:root\[data-cd-kontrast='hoch'\] )?\.djs-palette:not\(\[data-chrome='palette'\]\)($|[\s.:])/,
      );
    }
  });
});

describe('theme.sync — the vendored files are complete, unchanged copies (design system 1.12.0)', () => {
  it('both CSS files start with the vendoring header, followed by the generated banner', () => {
    for (const [name, source] of [
      ['cd-tokens.generated.css', vendoredTokensCss],
      ['cd-canvas.css', vendoredCanvasCss],
    ] as const) {
      const [header, banner] = source.split('\n');
      expect(header, name).toBe(VENDORED_HEADER);
      expect(banner, name).toMatch(/^\/\* AUTOMATISCH GENERIERT aus brand\/tokens\.json\./);
    }
  });

  it('the JSON is the generated file (no header of its own)', () => {
    expect(vendoredTokensJson.startsWith('{\n  "$description": "AUTOMATISCH GENERIERT')).toBe(true);
    expect(Object.keys(tokens)).toEqual([
      '$description',
      'hell',
      'dunkel',
      'hochkontrast',
      'fest',
      'shell',
    ]);
  });

  it('the JSON `hell` roles equal the light roles in the CSS (:root and [data-cd-theme="light"])', () => {
    const root = readVars(vendoredTokensCss, ':root', 'cd-tokens.generated.css');
    const light = readVars(
      vendoredTokensCss,
      '[data-cd-theme="light"],\n[data-cd-theme="system"]',
      'cd-tokens.generated.css',
    );
    expect(Object.keys(tokens.hell).length).toBeGreaterThan(20);
    expectDeclared(root, tokens.hell, ':root');
    expect(light).toEqual(normalizedValues(tokens.hell));
  });

  it('the JSON `dunkel` roles equal the dark roles in the CSS', () => {
    const dark = readVars(vendoredTokensCss, '[data-cd-theme="dark"]', 'cd-tokens.generated.css');
    expect(dark).toEqual(normalizedValues(tokens.dunkel));
  });

  it('the JSON `fest` and `shell` tokens equal the fixed tokens on :root', () => {
    const root = readVars(vendoredTokensCss, ':root', 'cd-tokens.generated.css');
    expectDeclared(root, tokens.fest, ':root (fest)');
    expectDeclared(root, tokens.shell, ':root (shell)');
  });
});

/** `blauLink` -> `--cd-blau-link`; `undefined` for app-specific keys the design system lacks. */
function vendoredTokenFor(key: string): string | undefined {
  const name = `--cd-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
  const value = readVars(vendoredTokensCss, ':root', 'cd-tokens.generated.css')[name];
  return value;
}

describe('theme.sync — MIRAGON mirrors the vendored design-system tokens', () => {
  it('every MIRAGON value with a --cd-* counterpart equals it', () => {
    const compared = Object.entries(MIRAGON).filter(([key]) => vendoredTokenFor(key) !== undefined);
    expect(compared.map(([key]) => key)).toEqual(
      expect.arrayContaining([
        'blau',
        'gruen',
        'grau',
        'schwarz',
        'weiss',
        'linie',
        'success',
        'warning',
        'danger',
        'info',
      ]),
    );
    for (const [key, value] of compared) {
      expect(norm(value), `MIRAGON.${key}`).toBe(vendoredTokenFor(key));
    }
  });

  it('the status colours are the 1.12.0 status layer', () => {
    expect(MIRAGON.success).toBe(tokens.fest['--cd-success']);
    expect(MIRAGON.warning).toBe(tokens.fest['--cd-warning']);
    expect(MIRAGON.danger).toBe(tokens.fest['--cd-danger']);
    expect(MIRAGON.info).toBe(tokens.fest['--cd-info']);
  });
});
