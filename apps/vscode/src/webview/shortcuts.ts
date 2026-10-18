import {
  formatPercent,
  shortcutLabel,
  type Platform,
  type ShellMessages,
} from '@miragon/modeler-shell/core';

export interface ShortcutRow {
  readonly action: string;
  /** Alternative key combinations, each shown as its own chip. */
  readonly keys: readonly string[];
}

export interface ShortcutGroup {
  readonly title: string;
  readonly rows: readonly ShortcutRow[];
}

const ARROWS = ['←', '↑', '→', '↓'] as const;

function editKeys(platform: Platform, keyNames: ShellMessages['keyNames']) {
  if (platform === 'mac') {
    return {
      undo: ['⌘Z'],
      redo: ['⌘⇧Z'],
      selectAll: ['⌘A'],
      copy: ['⌘C'],
      paste: ['⌘V'],
      duplicate: ['⌘D'],
      remove: ['⌫'],
      coarseMove: ARROWS.map((arrow) => `⇧${arrow}`),
      lassoDrag: ['⇧ Drag'],
    };
  }
  const { ctrl, shift } = keyNames;
  return {
    undo: [`${ctrl}+Z`],
    redo: [`${ctrl}+${shift}+Z`, `${ctrl}+Y`],
    selectAll: [`${ctrl}+A`],
    copy: [`${ctrl}+C`],
    paste: [`${ctrl}+V`],
    duplicate: [`${ctrl}+D`],
    remove: ['Del', 'Backspace'],
    coarseMove: ARROWS.map((arrow) => `${shift}+${arrow}`),
    lassoDrag: [`${shift}+Drag`],
  };
}

/**
 * Every shortcut of the board, grouped as guide §5.4 asks (View, Edit, the notation's tools). The
 * View group uses the shell's own labels, so dialog, tooltips and zoom panel always agree.
 */
export function keyboardShortcuts(
  platform: Platform,
  messages: ShellMessages,
  lang: string,
): ShortcutGroup[] {
  const view = (key: Parameters<typeof shortcutLabel>[0]) => [
    shortcutLabel(key, platform, messages.keyNames),
  ];
  const edit = editKeys(platform, messages.keyNames);
  return [
    {
      title: 'View',
      rows: [
        { action: messages.zoomIn, keys: view('zoomIn') },
        { action: messages.zoomOut, keys: view('zoomOut') },
        { action: messages.zoomToActual(formatPercent(1, lang)), keys: view('zoomToActual') },
        { action: messages.fit, keys: view('fit') },
      ],
    },
    {
      title: 'Edit',
      rows: [
        { action: 'Undo', keys: edit.undo },
        { action: 'Redo', keys: edit.redo },
        { action: 'Select all', keys: edit.selectAll },
        { action: 'Copy', keys: edit.copy },
        { action: 'Paste', keys: edit.paste },
        { action: 'Duplicate', keys: edit.duplicate },
        { action: 'Delete', keys: edit.remove },
        { action: 'Move selection', keys: ARROWS },
        { action: 'Move selection in large steps', keys: edit.coarseMove },
      ],
    },
    {
      title: 'Tools',
      rows: [
        { action: 'Lasso', keys: ['L'] },
        { action: 'Lasso by dragging', keys: edit.lassoDrag },
        { action: 'Domain event at the pointer', keys: ['E'] },
        { action: 'Command at the pointer', keys: ['C'] },
        { action: 'Finish a drawing', keys: ['Enter', 'Esc', 'Double-click'] },
      ],
    },
  ];
}
