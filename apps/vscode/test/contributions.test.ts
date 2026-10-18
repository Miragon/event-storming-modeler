import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEBVIEW_COMMANDS } from '../src/commands.js';

interface CommandContribution {
  command: string;
  title: string;
  category?: string;
}
interface MenuContribution {
  command: string;
  when?: string;
  group?: string;
}

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  contributes: {
    commands: CommandContribution[];
    menus: Record<string, MenuContribution[]>;
    keybindings?: unknown;
  };
};
const { contributes } = manifest;
const ON_BOARD = 'activeCustomEditorId == eventStorming.boardEditor';

describe('package.json contributions', () => {
  it('declares fit and export with Title Case titles in the Event Storming category', () => {
    const byId = new Map(contributes.commands.map((command) => [command.command, command]));

    expect(byId.get(WEBVIEW_COMMANDS.fitView)).toMatchObject({ title: 'Fit to View' });
    expect(byId.get(WEBVIEW_COMMANDS.exportPng)).toMatchObject({ title: 'Export as PNG' });
    expect(byId.get(WEBVIEW_COMMANDS.exportSvg)).toMatchObject({ title: 'Export as SVG' });
    for (const id of Object.values(WEBVIEW_COMMANDS)) {
      expect(byId.get(id)?.category).toBe('Event Storming');
    }
  });

  it('puts them in the editor title overflow, fit first, only for a board', () => {
    const entries = contributes.menus['editor/title'] ?? [];

    expect(entries.map((entry) => entry.command)).toEqual([
      WEBVIEW_COMMANDS.fitView,
      WEBVIEW_COMMANDS.exportPng,
      WEBVIEW_COMMANDS.exportSvg,
    ]);
    for (const entry of entries) {
      expect(entry.when).toBe(ON_BOARD);
      expect(entry.group).not.toMatch(/^navigation/);
    }
  });

  it('shows them in the Command Palette only while a board is focused', () => {
    const palette = new Map(
      (contributes.menus.commandPalette ?? []).map((entry) => [entry.command, entry.when]),
    );

    for (const id of Object.values(WEBVIEW_COMMANDS)) expect(palette.get(id)).toBe(ON_BOARD);
  });

  it('contributes no keybindings: the canvas keys apply while the webview has focus', () => {
    expect(contributes.keybindings).toBeUndefined();
  });

  it('references only declared commands in menus', () => {
    const declared = new Set(contributes.commands.map((command) => command.command));

    for (const entries of Object.values(contributes.menus)) {
      for (const entry of entries) expect(declared.has(entry.command)).toBe(true);
    }
  });
});
