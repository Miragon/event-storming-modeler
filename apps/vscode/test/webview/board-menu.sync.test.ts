import { describe, expect, it } from 'vitest';
import {
  ariaKeyShortcutsFromLabel,
  commandKeyLabel as shellCommandKeyLabel,
  defaultMessages,
  formatPercent,
  resolveMessages,
  shortcutLabel,
  type ChromeKey,
  type MenuGroups,
  type Platform,
  type ShellHandle,
  type ShellMessages,
} from '@miragon/modeler-shell';
import {
  STORM_EXPORT_LABEL,
  boardMenu,
  boardShortcuts,
  commandKeyLabel,
  type BoardMenu,
  type ShortcutsDialogChrome,
} from '@miragon/event-storming-renderer';

/*
 * The renderer builds the board's menu entries and shortcut tables without importing the shell
 * (only the apps mount it), so it mirrors the shell's types and its key labels. These tests pin
 * the mirror: the View rows of the shortcuts dialog say what the zoom panel's tooltips say, and
 * the menu and the dialog take what the shell hands them.
 */

const VIEW_KEYS: readonly ChromeKey[] = ['zoomIn', 'zoomOut', 'zoomToActual', 'fit'];

function viewActions(messages: ShellMessages, lang: string): string[] {
  return [
    messages.zoomIn,
    messages.zoomOut,
    messages.zoomToActual(formatPercent(1, lang)),
    messages.fit,
  ];
}

const GERMAN = resolveMessages({
  zoomIn: 'Vergrößern',
  zoomOut: 'Verkleinern',
  zoomToActual: (percent) => `Auf ${percent}`,
  fit: 'Einpassen',
  keyNames: { ctrl: 'Strg', shift: 'Umschalt' },
});

describe('the board menu and shortcuts against @miragon/modeler-shell', () => {
  for (const [lang, messages] of [
    ['en', defaultMessages],
    ['de', GERMAN],
  ] as const) {
    for (const platform of ['mac', 'other'] as const satisfies readonly Platform[]) {
      it(`the View rows equal the chrome tooltips (${lang}, ${platform})`, () => {
        const view = boardShortcuts({ platform, lang, messages }).find(
          (group) => group.title === 'View',
        );

        expect(view?.rows).toEqual(
          viewActions(messages, lang).map((action, index) => ({
            action,
            keys: [shortcutLabel(VIEW_KEYS[index]!, platform, messages.keyNames)],
          })),
        );
      });
    }
  }

  it('writes an app key chip the shell reads back as aria-keyshortcuts', () => {
    expect(ariaKeyShortcutsFromLabel(commandKeyLabel('O', 'mac', defaultMessages.keyNames))).toBe(
      'Meta+O',
    );
    expect(ariaKeyShortcutsFromLabel(commandKeyLabel('S', 'other', defaultMessages.keyNames))).toBe(
      'Control+S',
    );
  });

  it('writes the app key chips as the shell does', () => {
    for (const platform of ['mac', 'other'] as const) {
      for (const messages of [defaultMessages, GERMAN]) {
        expect(commandKeyLabel('O', platform, messages.keyNames)).toBe(
          shellCommandKeyLabel('O', platform, messages.keyNames),
        );
      }
    }
  });

  it('names the File row "Open…" as the shell’s File group does', () => {
    const file = boardShortcuts(
      { platform: 'mac', lang: 'en', messages: { ...defaultMessages, openFile: 'Öffnen…' } },
      { fileKeys: true },
    ).find((group) => group.title === 'File');

    expect(file?.rows[0]).toEqual({ action: 'Öffnen…', keys: ['⌘O'] });
    expect(file?.rows[1]?.action).toBe(STORM_EXPORT_LABEL);
  });

  it('the board menu is a menu the shell takes, and a shell handle is a dialog chrome', () => {
    const menu: BoardMenu = boardMenu({
      levels: { getLevel: () => 'design', setLevel: () => undefined },
      typeCaptions: { typeCaptionsVisible: () => true, setTypeCaptionsVisible: () => undefined },
      exports: { png: { onSelect: () => undefined }, svg: { onSelect: () => undefined } },
      showKeyboardShortcuts: () => undefined,
    });
    const groups: MenuGroups = menu;
    const chrome = (shell: ShellHandle): ShortcutsDialogChrome => shell;

    expect(groups.model).toHaveLength(2);
    expect(chrome).toBeTypeOf('function');
  });
});
