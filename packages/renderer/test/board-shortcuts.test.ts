import { describe, expect, it } from 'vitest';
import { boardShortcuts, commandKeyLabel, type ShortcutsChrome } from '../src/board-menu/index.js';

/** The chrome's English texts (the shell's defaults); `shortcuts.sync.test.ts` in apps/vscode pins them. */
const MESSAGES: ShortcutsChrome['messages'] = {
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomToActual: (percent) => `Zoom to ${percent}`,
  fit: 'Fit to view',
  keyNames: { ctrl: 'Ctrl', shift: 'Shift', plus: 'Plus', minus: 'Minus' },
};

function chrome(platform: 'mac' | 'other', lang = 'en'): ShortcutsChrome {
  return { platform, lang, messages: MESSAGES };
}

function rowsOf(platform: 'mac' | 'other', title: string): Map<string, readonly string[]> {
  const group = boardShortcuts(chrome(platform)).find((candidate) => candidate.title === title);
  return new Map(group!.rows.map((row) => [row.action, row.keys]));
}

describe('boardShortcuts', () => {
  it('groups the shortcuts as View, Edit and Tools', () => {
    expect(boardShortcuts(chrome('mac')).map((group) => group.title)).toEqual([
      'View',
      'Edit',
      'Tools',
    ]);
  });

  it('puts the web app’s file keys first when it binds them', () => {
    const [file, ...rest] = boardShortcuts(chrome('other'), { fileKeys: true });

    expect(file).toEqual({
      title: 'File',
      rows: [
        { action: 'Open…', keys: ['Ctrl+O'] },
        { action: 'Export as .storm', keys: ['Ctrl+S'] },
      ],
    });
    expect(rest.map((group) => group.title)).toEqual(['View', 'Edit', 'Tools']);
    expect(boardShortcuts(chrome('mac'), { fileKeys: true })[0]!.rows[0]!.keys).toEqual(['⌘O']);
  });

  it('names the zoom keys as the chrome tooltips do (guide §5.8)', () => {
    expect([...rowsOf('mac', 'View')]).toEqual([
      ['Zoom in', ['⌘+']],
      ['Zoom out', ['⌘−']],
      ['Zoom to 100%', ['⌘0']],
      ['Fit to view', ['⇧1']],
    ]);
    expect([...rowsOf('other', 'View')]).toEqual([
      ['Zoom in', ['Ctrl+Plus']],
      ['Zoom out', ['Ctrl+Minus']],
      ['Zoom to 100%', ['Ctrl+0']],
      ['Fit to view', ['Shift+1']],
    ]);
  });

  it('writes the edit keys per platform', () => {
    expect(rowsOf('mac', 'Edit').get('Undo')).toEqual(['⌘Z']);
    expect(rowsOf('mac', 'Edit').get('Redo')).toEqual(['⌘⇧Z']);
    expect(rowsOf('other', 'Edit').get('Undo')).toEqual(['Ctrl+Z']);
    expect(rowsOf('other', 'Edit').get('Redo')).toEqual(['Ctrl+Shift+Z', 'Ctrl+Y']);
    expect(rowsOf('other', 'Edit').get('Delete')).toEqual(['Del', 'Backspace']);
    expect(rowsOf('mac', 'Edit').get('Select all')).toEqual(['⌘A']);
    expect(rowsOf('other', 'Edit').get('Select all')).toEqual(['Ctrl+A']);
  });

  // The palette tooltips name only the tool; how to drag a lasso or end a drawing lives here.
  it('lists the tools of the palette with their keys and gestures', () => {
    expect([...rowsOf('other', 'Tools')]).toEqual([
      ['Lasso', ['L']],
      ['Lasso by dragging', ['Shift+Drag']],
      ['Domain event at the pointer', ['E']],
      ['Command at the pointer', ['C']],
      ['Finish a drawing', ['Enter', 'Esc', 'Double-click']],
    ]);
    expect(rowsOf('mac', 'Tools').get('Lasso by dragging')).toEqual(['⇧ Drag']);
  });

  it('localizes through the chrome’s messages and language', () => {
    const german: ShortcutsChrome = {
      platform: 'other',
      lang: 'de',
      messages: {
        ...MESSAGES,
        zoomIn: 'Vergrößern',
        zoomToActual: (percent) => `Auf ${percent}`,
        keyNames: { ...MESSAGES.keyNames, ctrl: 'Strg' },
      },
    };

    const [view, edit] = boardShortcuts(german);

    expect(view!.rows[0]).toEqual({ action: 'Vergrößern', keys: ['Strg+Plus'] });
    expect(view!.rows[2]!.action).toBe('Auf 100 %');
    expect(edit!.rows[0]!.keys).toEqual(['Strg+Z']);
    expect(boardShortcuts({ ...german, lang: '' })[0]!.rows[2]!.action).toBe('Auf 100%');
  });

  it('labels a Cmd/Ctrl key of the app the way the chrome writes its chips', () => {
    expect(commandKeyLabel('O', 'mac', { ctrl: 'Ctrl' })).toBe('⌘O');
    expect(commandKeyLabel('S', 'other', { ctrl: 'Strg' })).toBe('Strg+S');
  });
});
