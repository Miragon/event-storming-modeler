import type { BoardLevel } from '@miragon/event-storming-schema-model';

/*
 * The board's entries of the chrome menu (guide §5.4), the same in every host. The types mirror
 * the menu groups of `@miragon/modeler-shell` structurally, so an app hands the result to the
 * shell as it is while the renderer never imports the shell.
 */

/** The icons the guide gives these entries (guide §5.14, the shell's common set). */
export type BoardMenuIcon = 'file-image' | 'file-code-corner' | 'keyboard';

interface BoardMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: BoardMenuIcon;
  readonly keepEnabledWhenReadOnly?: boolean;
}

export interface BoardMenuAction extends BoardMenuItem {
  readonly kind: 'action';
  readonly shortcut?: string;
  onSelect(): void;
}

export interface BoardMenuDialog extends BoardMenuItem {
  readonly kind: 'dialog';
  onSelect(): void;
}

export interface BoardMenuCheckbox extends BoardMenuItem {
  readonly kind: 'checkbox';
  checked(): boolean;
  onToggle(checked: boolean): void;
}

export interface BoardMenuRadioGroup {
  readonly kind: 'radio';
  readonly id: string;
  readonly label: string;
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  value(): string | undefined;
  onSelect(value: string): void;
}

export type BoardMenuEntry =
  BoardMenuAction | BoardMenuDialog | BoardMenuCheckbox | BoardMenuRadioGroup;

export interface BoardMenu {
  readonly model: readonly BoardMenuEntry[];
  readonly export: readonly BoardMenuEntry[];
  readonly help: readonly BoardMenuEntry[];
}

/** The workshop level of the board (`eventStormingModeling`). */
export interface BoardLevels {
  getLevel(): BoardLevel;
  setLevel(level: BoardLevel): void;
}

/** The type captions on the stickies (`eventStormingViewOptions`). */
export interface TypeCaptions {
  typeCaptionsVisible(): boolean;
  setTypeCaptionsVisible(visible: boolean): void;
}

export interface BoardExport {
  onSelect(): void;
  /** The chip of an app key that runs the same export, e.g. "⌘S". */
  readonly shortcut?: string | undefined;
}

/**
 * The exports a host offers, in the guide's order: PNG first (the more frequent target), then
 * SVG, then the variants, then further formats. Both hosts offer PNG, SVG, the transparent PNG and
 * JSON (guide §5.2: one Export group); only the web app adds .storm, which in VS Code is the file.
 */
export interface BoardExports {
  readonly png: BoardExport;
  readonly svg: BoardExport;
  readonly transparentPng?: BoardExport | undefined;
  readonly json?: BoardExport | undefined;
  readonly storm?: BoardExport | undefined;
}

export interface BoardMenuActions {
  readonly levels: BoardLevels;
  readonly typeCaptions: TypeCaptions;
  /** Every toggle of the type captions, so the host can remember the choice. */
  onTypeCaptionsToggled?(visible: boolean): void;
  readonly exports: BoardExports;
  showKeyboardShortcuts(): void;
}

/** The web app's native-format export, in the Export group and in the shortcuts dialog. */
export const STORM_EXPORT_LABEL = 'Export as .storm';

export const BOARD_LEVELS: ReadonlyArray<{ readonly value: BoardLevel; readonly label: string }> = [
  { value: 'big-picture', label: 'Big picture' },
  { value: 'process', label: 'Process modeling' },
  { value: 'design', label: 'Software design' },
];

function isBoardLevel(value: string): value is BoardLevel {
  return BOARD_LEVELS.some((level) => level.value === value);
}

function exportEntry(
  id: string,
  label: string,
  action: BoardExport,
  icon?: BoardMenuIcon,
): BoardMenuAction {
  return {
    kind: 'action',
    id,
    label,
    ...(icon ? { icon } : {}),
    ...(action.shortcut ? { shortcut: action.shortcut } : {}),
    onSelect: () => action.onSelect(),
  };
}

function exportEntries(exports: BoardExports): BoardMenuAction[] {
  const entries = [
    exportEntry('export-png', 'Export as PNG', exports.png, 'file-image'),
    exportEntry('export-svg', 'Export as SVG', exports.svg, 'file-code-corner'),
  ];
  if (exports.transparentPng) {
    entries.push(
      exportEntry(
        'export-png-transparent',
        'Export as PNG (4×, transparent)',
        exports.transparentPng,
      ),
    );
  }
  if (exports.json) entries.push(exportEntry('export-json', 'Export as JSON', exports.json));
  if (exports.storm) entries.push(exportEntry('export-storm', STORM_EXPORT_LABEL, exports.storm));
  return entries;
}

/** The menu groups of the board (guide §5.4): Model, Export with PNG first, Help. */
export function boardMenu(actions: BoardMenuActions): BoardMenu {
  return {
    model: [
      {
        kind: 'radio',
        id: 'level',
        label: 'Level',
        options: BOARD_LEVELS,
        value: () => actions.levels.getLevel(),
        onSelect: (value) => {
          if (isBoardLevel(value)) actions.levels.setLevel(value);
        },
      },
      {
        kind: 'checkbox',
        id: 'type-captions',
        label: 'Type captions',
        // A view preference, not board content: it stays usable on a read-only canvas.
        keepEnabledWhenReadOnly: true,
        checked: () => actions.typeCaptions.typeCaptionsVisible(),
        onToggle: (visible) => {
          actions.typeCaptions.setTypeCaptionsVisible(visible);
          actions.onTypeCaptionsToggled?.(visible);
        },
      },
    ],
    export: exportEntries(actions.exports),
    help: [
      {
        kind: 'dialog',
        id: 'keyboard-shortcuts',
        label: 'Keyboard shortcuts…',
        icon: 'keyboard',
        onSelect: () => actions.showKeyboardShortcuts(),
      },
    ],
  };
}
