import { iconElement, type ShellHandle } from '@miragon/modeler-shell';
import { keyboardShortcuts, type ShortcutGroup } from './shortcuts.js';

const DIALOG_CLASS = 'event-storming-shortcuts';
const TITLE_ID = 'event-storming-shortcuts-title';

export interface ShortcutsDialog {
  open(): void;
  isOpen(): boolean;
  close(): void;
  destroy(): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}

function shortcutTable(group: ShortcutGroup, index: number): HTMLElement {
  const section = element('section', `${DIALOG_CLASS}-group`);
  const headingId = `${TITLE_ID}-group-${index}`;
  const heading = element('h4', `${DIALOG_CLASS}-group-title`, group.title);
  heading.id = headingId;
  const table = element('table', `${DIALOG_CLASS}-table`);
  table.setAttribute('aria-labelledby', headingId);
  const body = table.createTBody();
  for (const row of group.rows) {
    const line = body.insertRow();
    const action = element('th', `${DIALOG_CLASS}-action`, row.action);
    action.scope = 'row';
    const keys = element('td', `${DIALOG_CLASS}-keys`);
    for (const key of row.keys) keys.append(element('kbd', `${DIALOG_CLASS}-key`, key));
    line.append(action, keys);
  }
  section.append(heading, table);
  return section;
}

function dialogContent(shell: ShellHandle, onClose: () => void): HTMLElement {
  const panel = element('div', `${DIALOG_CLASS}-panel`);
  const header = element('header', `${DIALOG_CLASS}-header`);
  const title = element('h3', `${DIALOG_CLASS}-title`, 'Keyboard shortcuts');
  title.id = TITLE_ID;
  const close = element('button', `${DIALOG_CLASS}-close`);
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.append(iconElement('x'));
  close.addEventListener('click', onClose);
  header.append(title, close);

  const body = element('div', `${DIALOG_CLASS}-body`);
  body.append(...keyboardShortcuts(shell.platform, shell.messages, shell.lang).map(shortcutTable));
  panel.append(header, body);
  return panel;
}

/**
 * The "Keyboard shortcuts…" dialog of the Help group (guide §5.4, §8), a native modal <dialog>
 * inside the shell root: the browser keeps the focus inside it and closes it on Escape. Built on
 * the first open and kept (closed) afterwards; `destroy()` removes it with the diagram.
 */
export function createShortcutsDialog(shell: ShellHandle): ShortcutsDialog {
  let dialog: HTMLDialogElement | undefined;

  function build(): HTMLDialogElement {
    const created = element('dialog', DIALOG_CLASS);
    created.setAttribute('aria-labelledby', TITLE_ID);
    created.append(dialogContent(shell, () => created.close()));
    // A click on the backdrop targets the <dialog> itself; the panel covers all of its own box.
    created.addEventListener('click', (event) => {
      if (event.target === created) created.close();
    });
    created.addEventListener('close', () => {
      if (!shell.menu.trigger.hidden) shell.menu.trigger.focus({ preventScroll: true });
    });
    shell.root.append(created);
    return created;
  }

  return {
    open() {
      dialog ??= build();
      if (!dialog.open) dialog.showModal();
    },
    close() {
      dialog?.close();
    },
    isOpen: () => dialog?.open === true,
    destroy() {
      dialog?.remove();
      dialog = undefined;
    },
  };
}
