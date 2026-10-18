import { describe, expect, it } from 'vitest';
import { defaultMessages, shortcutLabel } from '@miragon/modeler-shell/core';
import { keyboardShortcuts } from '../../src/webview/shortcuts.js';

describe('keyboardShortcuts', () => {
  it('groups the shortcuts as View, Edit and Tools', () => {
    expect(keyboardShortcuts('mac', defaultMessages, 'en').map((group) => group.title)).toEqual([
      'View',
      'Edit',
      'Tools',
    ]);
  });

  it("takes the View rows from the shell's labels, so dialog and tooltips agree", () => {
    for (const platform of ['mac', 'other'] as const) {
      const [view] = keyboardShortcuts(platform, defaultMessages, 'en');
      expect(view!.rows).toEqual([
        { action: 'Zoom in', keys: [shortcutLabel('zoomIn', platform, defaultMessages.keyNames)] },
        {
          action: 'Zoom out',
          keys: [shortcutLabel('zoomOut', platform, defaultMessages.keyNames)],
        },
        {
          action: 'Zoom to 100%',
          keys: [shortcutLabel('zoomToActual', platform, defaultMessages.keyNames)],
        },
        { action: 'Fit to view', keys: [shortcutLabel('fit', platform, defaultMessages.keyNames)] },
      ]);
    }
  });

  it('writes the edit keys per platform', () => {
    const edit = (platform: 'mac' | 'other') =>
      new Map(
        keyboardShortcuts(platform, defaultMessages, 'en')[1]!.rows.map((row) => [
          row.action,
          row.keys,
        ]),
      );

    expect(edit('mac').get('Undo')).toEqual(['⌘Z']);
    expect(edit('mac').get('Redo')).toEqual(['⌘⇧Z']);
    expect(edit('other').get('Undo')).toEqual(['Ctrl+Z']);
    expect(edit('other').get('Redo')).toEqual(['Ctrl+Shift+Z', 'Ctrl+Y']);
    expect(edit('other').get('Delete')).toEqual(['Del', 'Backspace']);
    expect(edit('mac').get('Select all')).toEqual(['⌘A']);
    expect(edit('other').get('Select all')).toEqual(['Ctrl+A']);
  });

  // The palette tooltips name only the tool; how to drag a lasso or end a drawing lives here.
  it('lists the tools of the palette with their keys and gestures', () => {
    const tools = keyboardShortcuts('other', defaultMessages, 'en')[2]!;

    expect(tools.rows).toEqual([
      { action: 'Lasso', keys: ['L'] },
      { action: 'Lasso by dragging', keys: ['Shift+Drag'] },
      { action: 'Domain event at the pointer', keys: ['E'] },
      { action: 'Command at the pointer', keys: ['C'] },
      { action: 'Finish a drawing', keys: ['Enter', 'Esc', 'Double-click'] },
    ]);
    expect(keyboardShortcuts('mac', defaultMessages, 'en')[2]!.rows[1]!.keys).toEqual(['⇧ Drag']);
  });

  it('localizes through the messages table', () => {
    const german = {
      ...defaultMessages,
      zoomIn: 'Vergrößern',
      keyNames: { ...defaultMessages.keyNames, ctrl: 'Strg' },
    };

    const [view, edit] = keyboardShortcuts('other', german, 'de');

    expect(view!.rows[0]).toEqual({ action: 'Vergrößern', keys: ['Strg+Plus'] });
    expect(edit!.rows[0]!.keys).toEqual(['Strg+Z']);
  });
});
