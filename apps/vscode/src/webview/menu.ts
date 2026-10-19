import type { MenuGroups } from '@miragon/modeler-shell';
import type { BoardLevel } from '@miragon/event-storming-schema-model';

export interface BoardLevels {
  getLevel(): BoardLevel;
  setLevel(level: BoardLevel): void;
}

export interface TypeCaptions {
  typeCaptionsVisible(): boolean;
  setTypeCaptionsVisible(visible: boolean): void;
}

export interface BoardMenuActions {
  levels: BoardLevels;
  typeCaptions: TypeCaptions;
  onTypeCaptionsToggled(visible: boolean): void;
  exportPng(): void;
  exportSvg(): void;
  showKeyboardShortcuts(): void;
}

const LEVELS: ReadonlyArray<{ value: BoardLevel; label: string }> = [
  { value: 'big-picture', label: 'Big picture' },
  { value: 'process', label: 'Process modeling' },
  { value: 'design', label: 'Software design' },
];

function isBoardLevel(value: string): value is BoardLevel {
  return LEVELS.some((level) => level.value === value);
}

/** The webview menu (guide §5.4): Model, Export with PNG first, Help. */
export function boardMenu(actions: BoardMenuActions): MenuGroups {
  return {
    model: [
      {
        kind: 'radio',
        id: 'level',
        label: 'Level',
        options: LEVELS,
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
          actions.onTypeCaptionsToggled(visible);
        },
      },
    ],
    export: [
      {
        kind: 'action',
        id: 'export-png',
        label: 'Export as PNG',
        icon: 'file-image',
        onSelect: actions.exportPng,
      },
      {
        kind: 'action',
        id: 'export-svg',
        label: 'Export as SVG',
        icon: 'file-code-corner',
        onSelect: actions.exportSvg,
      },
    ],
    help: [
      {
        kind: 'dialog',
        id: 'keyboard-shortcuts',
        label: 'Keyboard shortcuts…',
        icon: 'keyboard',
        onSelect: actions.showKeyboardShortcuts,
      },
    ],
  };
}
