import { STORM_EXPORT_LABEL } from './menu.js';

/*
 * Every shortcut of the board for the "Keyboard shortcuts…" dialog (guide §5.4): one table per
 * group, the keys as chips like the chrome tooltip's (guide §5.6). The chrome's texts and key
 * names come in structurally (a `@miragon/modeler-shell` handle fits), so the View rows say what
 * the zoom panel's tooltips say.
 */

export type ShortcutPlatform = 'mac' | 'other';

export interface ShortcutKeyNames {
  readonly ctrl: string;
  readonly shift: string;
  readonly plus: string;
  readonly minus: string;
}

/** What the shortcuts need of the chrome around the board. */
export interface ShortcutsChrome {
  readonly platform: ShortcutPlatform;
  /** The tool's UI language, for the percentage in "Zoom to 100%". */
  readonly lang: string;
  readonly messages: {
    readonly zoomIn: string;
    readonly zoomOut: string;
    zoomToActual(percent: string): string;
    readonly fit: string;
    /** The File group's "Open…" (the shell's `messages.openFile`); default "Open…". */
    readonly openFile?: string | undefined;
    readonly keyNames: ShortcutKeyNames;
  };
}

export interface ShortcutRow {
  readonly action: string;
  /** Alternative key combinations, each shown as its own chip. */
  readonly keys: readonly string[];
}

export interface ShortcutGroup {
  readonly title: string;
  readonly rows: readonly ShortcutRow[];
}

export interface BoardShortcutOptions {
  /** The web app's file keys: Cmd/Ctrl+O opens a file, Cmd/Ctrl+S exports the .storm file. */
  readonly fileKeys?: boolean | undefined;
}

const ARROWS = ['←', '↑', '→', '↓'] as const;

/** "⌘O" on macOS, "Ctrl+O" elsewhere: the chip of a Cmd/Ctrl key the app binds itself. */
export function commandKeyLabel(
  key: string,
  platform: ShortcutPlatform,
  keyNames: Pick<ShortcutKeyNames, 'ctrl'>,
): string {
  return platform === 'mac' ? `⌘${key}` : `${keyNames.ctrl}+${key}`;
}

function percentOfActualSize(lang: string): string {
  try {
    return new Intl.NumberFormat(lang, { style: 'percent' }).format(1);
  } catch {
    return new Intl.NumberFormat('en', { style: 'percent' }).format(1);
  }
}

/** The chrome's zoom and fit keys as its tooltips name them (guide §5.8). */
function viewKeys(platform: ShortcutPlatform, keyNames: ShortcutKeyNames) {
  if (platform === 'mac') {
    return { zoomIn: '⌘+', zoomOut: '⌘−', zoomToActual: '⌘0', fit: '⇧1' };
  }
  const { ctrl, shift, plus, minus } = keyNames;
  return {
    zoomIn: `${ctrl}+${plus}`,
    zoomOut: `${ctrl}+${minus}`,
    zoomToActual: `${ctrl}+0`,
    fit: `${shift}+1`,
  };
}

function editKeys(platform: ShortcutPlatform, keyNames: ShortcutKeyNames) {
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

function fileGroup(chrome: ShortcutsChrome): ShortcutGroup {
  const { platform, messages } = chrome;
  return {
    title: 'File',
    rows: [
      {
        action: messages.openFile ?? 'Open…',
        keys: [commandKeyLabel('O', platform, messages.keyNames)],
      },
      { action: STORM_EXPORT_LABEL, keys: [commandKeyLabel('S', platform, messages.keyNames)] },
    ],
  };
}

/**
 * Every shortcut of the board, grouped as guide §5.4 asks (View, Edit, the notation's tools),
 * after the web app's File keys where it binds them.
 */
export function boardShortcuts(
  chrome: ShortcutsChrome,
  options: BoardShortcutOptions = {},
): ShortcutGroup[] {
  const { platform, messages } = chrome;
  const view = viewKeys(platform, messages.keyNames);
  const edit = editKeys(platform, messages.keyNames);
  return [
    ...(options.fileKeys ? [fileGroup(chrome)] : []),
    {
      title: 'View',
      rows: [
        { action: messages.zoomIn, keys: [view.zoomIn] },
        { action: messages.zoomOut, keys: [view.zoomOut] },
        {
          action: messages.zoomToActual(percentOfActualSize(chrome.lang)),
          keys: [view.zoomToActual],
        },
        { action: messages.fit, keys: [view.fit] },
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
