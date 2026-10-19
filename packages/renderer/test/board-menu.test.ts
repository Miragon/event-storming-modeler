import { describe, expect, it, vi } from 'vitest';
import type { BoardLevel } from '@miragon/event-storming-schema-model';
import {
  boardMenu,
  type BoardMenuActions,
  type BoardMenuCheckbox,
  type BoardMenuEntry,
  type BoardMenuRadioGroup,
} from '../src/board-menu/index.js';

function actions(
  exports: Partial<BoardMenuActions['exports']> = {},
): BoardMenuActions & { level: BoardLevel; captions: boolean } {
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
    exports: {
      png: { onSelect: vi.fn() },
      svg: { onSelect: vi.fn() },
      ...exports,
    },
    showKeyboardShortcuts: vi.fn(),
  };
  return state;
}

function ids(entries: readonly BoardMenuEntry[]): string[] {
  return entries.map((entry) => entry.id);
}

describe('boardMenu', () => {
  it('has the groups Model, Export with PNG before SVG, and Help', () => {
    const menu = boardMenu(actions());

    expect(ids(menu.model)).toEqual(['level', 'type-captions']);
    expect(ids(menu.export)).toEqual(['export-png', 'export-svg']);
    expect(ids(menu.help)).toEqual(['keyboard-shortcuts']);
    expect(menu.export.map((entry) => 'icon' in entry && entry.icon)).toEqual([
      'file-image',
      'file-code-corner',
    ]);
    expect(menu.help[0]).toMatchObject({
      kind: 'dialog',
      label: 'Keyboard shortcuts…',
      icon: 'keyboard',
    });
  });

  it('adds the web app exports after PNG and SVG, without icons (guide §5.4, §5.14)', () => {
    const menu = boardMenu(
      actions({
        transparentPng: { onSelect: vi.fn() },
        json: { onSelect: vi.fn() },
        storm: { onSelect: vi.fn(), shortcut: '⌘S' },
      }),
    );

    expect(menu.export.map((entry) => [entry.id, entry.label])).toEqual([
      ['export-png', 'Export as PNG'],
      ['export-svg', 'Export as SVG'],
      ['export-png-transparent', 'Export as PNG (4×, transparent)'],
      ['export-json', 'Export as JSON'],
      ['export-storm', 'Export as .storm'],
    ]);
    expect(menu.export.slice(2).some((entry) => 'icon' in entry)).toBe(false);
    expect(menu.export[4]).toMatchObject({ kind: 'action', shortcut: '⌘S' });
    expect(menu.export[0]).not.toHaveProperty('shortcut');
  });

  it('reads and sets the workshop level through the radio group', () => {
    const state = actions();
    const level = boardMenu(state).model[0] as BoardMenuRadioGroup;

    expect(level.options).toEqual([
      { value: 'big-picture', label: 'Big picture' },
      { value: 'process', label: 'Process modeling' },
      { value: 'design', label: 'Software design' },
    ]);
    expect(level.value()).toBe('design');
    level.onSelect('process');
    level.onSelect('not-a-level');

    expect(state.levels.setLevel).toHaveBeenCalledTimes(1);
    expect(level.value()).toBe('process');
  });

  it('toggles the type captions as view state that stays usable on a read-only canvas', () => {
    const state = actions();
    const captions = boardMenu(state).model[1] as BoardMenuCheckbox;

    captions.onToggle(false);

    expect(captions.keepEnabledWhenReadOnly).toBe(true);
    expect(captions.checked()).toBe(false);
    expect(state.onTypeCaptionsToggled).toHaveBeenCalledWith(false);
  });

  it('runs the export and dialog actions', () => {
    const state = actions({
      transparentPng: { onSelect: vi.fn() },
      json: { onSelect: vi.fn() },
      storm: { onSelect: vi.fn() },
    });
    const menu = boardMenu(state);

    for (const entry of [...menu.export, ...menu.help]) {
      if (entry.kind === 'action' || entry.kind === 'dialog') entry.onSelect();
    }

    for (const exportAction of Object.values(state.exports)) {
      expect(exportAction.onSelect).toHaveBeenCalledOnce();
    }
    expect(state.showKeyboardShortcuts).toHaveBeenCalledOnce();
  });
});
