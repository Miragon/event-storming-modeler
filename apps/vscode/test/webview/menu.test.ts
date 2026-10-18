import { describe, expect, it, vi } from 'vitest';
import type { MenuCheckboxEntry, MenuEntry, MenuRadioGroup } from '@miragon/modeler-shell';
import type { BoardLevel } from '@miragon/event-storming-schema-model';
import { boardMenu, type BoardMenuActions } from '../../src/webview/menu.js';

function actions(): BoardMenuActions & { level: BoardLevel; captions: boolean } {
  const state = {
    level: 'design' as BoardLevel,
    captions: true,
    levels: {
      getLevel: () => state.level,
      setLevel: vi.fn((level: BoardLevel) => {
        state.level = level;
      }),
    },
    typeCaptions: {
      typeCaptionsVisible: () => state.captions,
      setTypeCaptionsVisible: vi.fn((visible: boolean) => {
        state.captions = visible;
      }),
    },
    onTypeCaptionsToggled: vi.fn(),
    exportPng: vi.fn(),
    exportSvg: vi.fn(),
    showKeyboardShortcuts: vi.fn(),
  };
  return state;
}

function ids(entries: readonly MenuEntry[] | undefined): string[] {
  return (entries ?? []).map((entry) => entry.id);
}

describe('boardMenu', () => {
  it('has the groups Model, Export with PNG before SVG, and Help', () => {
    const menu = boardMenu(actions());

    expect(ids(menu.model)).toEqual(['level', 'type-captions']);
    expect(ids(menu.export)).toEqual(['export-png', 'export-svg']);
    expect(ids(menu.help)).toEqual(['keyboard-shortcuts']);
    expect(menu.export?.map((entry) => 'icon' in entry && entry.icon)).toEqual([
      'file-image',
      'file-code-corner',
    ]);
    expect(menu.help?.[0]).toMatchObject({
      kind: 'dialog',
      label: 'Keyboard shortcuts…',
      icon: 'keyboard',
    });
  });

  it('reads and sets the workshop level through the radio group', () => {
    const state = actions();
    const level = boardMenu(state).model?.[0] as MenuRadioGroup;

    expect(level.options.map((option) => option.value)).toEqual([
      'big-picture',
      'process',
      'design',
    ]);
    expect(level.value()).toBe('design');
    level.onSelect('process');
    level.onSelect('not-a-level');

    expect(state.levels.setLevel).toHaveBeenCalledTimes(1);
    expect(level.value()).toBe('process');
  });

  it('toggles the type captions as view state that stays usable on a read-only canvas', () => {
    const state = actions();
    const captions = boardMenu(state).model?.[1] as MenuCheckboxEntry;

    captions.onToggle(false);

    expect(captions.keepEnabledWhenReadOnly).toBe(true);
    expect(captions.checked()).toBe(false);
    expect(state.onTypeCaptionsToggled).toHaveBeenCalledWith(false);
  });

  it('runs the export and dialog actions', () => {
    const state = actions();
    const menu = boardMenu(state);

    for (const entry of [...(menu.export ?? []), ...(menu.help ?? [])]) {
      if (entry.kind === 'action' || entry.kind === 'dialog') entry.onSelect();
    }

    expect(state.exportPng).toHaveBeenCalledOnce();
    expect(state.exportSvg).toHaveBeenCalledOnce();
    expect(state.showKeyboardShortcuts).toHaveBeenCalledOnce();
  });
});
