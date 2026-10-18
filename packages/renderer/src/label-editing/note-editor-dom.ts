import type { NoteAlignHorizontal, NoteAlignVertical } from '@miragon/event-storming-schema-model';
import { parseNoteMarkdown, serializeNoteMarkdown } from '../draw/index.js';
import { chromeIcon, type LucideIconName } from '../draw/lucide.js';

/**
 * DOM half of the WYSIWYG note editor: the model stores a note label as ONE markdown-subset
 * string (see draw/note-markdown.ts), the contenteditable overlay speaks live DOM. This module
 * translates between the two — markdown→DOM on open, DOM→markdown on commit — and hosts the
 * selection/bullet/toolbar helpers that only exist because of contenteditable quirks.
 */

/** Class on line `<div>`s carrying the `- ` bullet marker (the '•' itself renders via CSS). */
export const NOTE_BULLET_CLASS = 'bullet';

export type NoteToolbarAction =
  'note-bold' | 'note-italic' | 'note-bullet' | 'note-align-horizontal' | 'note-align-vertical';

export interface NoteAlignState {
  horizontal: NoteAlignHorizontal;
  vertical: NoteAlignVertical;
}

export const HORIZONTAL_CYCLE: readonly NoteAlignHorizontal[] = ['left', 'center', 'right'];
export const VERTICAL_CYCLE: readonly NoteAlignVertical[] = ['top', 'middle', 'bottom'];

export function nextInCycle<T>(cycle: readonly T[], value: T): T {
  return cycle[(cycle.indexOf(value) + 1) % cycle.length]!;
}

/** One `<div>` per markdown line: `<b>`/`<i>` for the runs, `.bullet` rows for `- ` lines. */
export function noteMarkdownToDom(root: HTMLElement, label: string): void {
  const doc = root.ownerDocument;
  root.textContent = '';
  for (const line of parseNoteMarkdown(label)) {
    const div = doc.createElement('div');
    if (line.bullet) div.className = NOTE_BULLET_CLASS;
    for (const run of line.runs) {
      let node: Node = doc.createTextNode(run.text);
      if (run.italic) node = wrapIn(doc, 'i', node);
      if (run.bold) node = wrapIn(doc, 'b', node);
      div.appendChild(node);
    }
    // An empty line div would collapse to zero height — the <br> placeholder keeps it visible
    // and editable (the same trick contenteditable browsers use themselves).
    if (line.runs.length === 0) div.appendChild(doc.createElement('br'));
    root.appendChild(div);
  }
}

function wrapIn(doc: Document, tag: string, node: Node): Node {
  const el = doc.createElement(tag);
  el.appendChild(node);
  return el;
}

interface EditorLine {
  bullet: boolean;
  runs: Array<{ text: string; bold: boolean; italic: boolean }>;
}

/**
 * Reads the contenteditable back into the CANONICAL markdown string (via the pinned
 * note-markdown serializer — never hand-emitted markers). Lenient on input: it understands the
 * DOM this module writes AND the browser-flavored structures `execCommand`/typing produce
 * (strong/em, styled spans, bare first-line text, `<br>` breaks, raw '\n' from plain-text
 * paste), so a commit never loses text.
 */
export function domToNoteMarkdown(root: HTMLElement): string {
  const lines: EditorLine[] = [];
  let current: EditorLine | null = null;
  const open = (bullet: boolean): EditorLine => {
    current = { bullet, runs: [] };
    lines.push(current);
    return current;
  };

  const visitInline = (node: Node, bold: boolean, italic: boolean): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Plain-text paste can leave raw '\n' inside one text node (rendered as breaks by
      // `white-space: pre-wrap`) — every segment after a '\n' is its own line.
      (node.nodeValue ?? '').split('\n').forEach((segment, i) => {
        if (i > 0) open(false);
        (current ?? open(false)).runs.push({ text: segment, bold, italic });
      });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === 'BR') {
      // A trailing <br> is the invisible placeholder browsers keep in lines — only a <br>
      // with content after it is a real line break.
      if (el.nextSibling) open(false);
      return;
    }
    if (isBlockTag(el.tagName)) {
      visitBlock(el);
      return;
    }
    const style = styledAs(el, bold, italic);
    for (const child of el.childNodes) visitInline(child, style.bold, style.italic);
  };

  const visitBlock = (el: HTMLElement): void => {
    open(el.classList.contains(NOTE_BULLET_CLASS) || el.tagName === 'LI');
    for (const child of el.childNodes) visitInline(child, false, false);
    // Blocks always break: content after a closed block starts a fresh line.
    current = null;
  };

  for (const child of root.childNodes) visitInline(child, false, false);
  return serializeNoteMarkdown(lines);
}

function isBlockTag(tag: string): boolean {
  return tag === 'DIV' || tag === 'P' || tag === 'LI';
}

/**
 * Effective bold/italic of an element within its inherited context: the semantic tags this
 * module writes (b/i) plus the browser-flavored `execCommand` output (strong/em, spans with
 * inline font-weight/font-style — including the `normal` values Chrome uses to UN-format
 * inside a styled ancestor).
 */
function styledAs(
  el: HTMLElement,
  bold: boolean,
  italic: boolean,
): { bold: boolean; italic: boolean } {
  const tag = el.tagName;
  if (tag === 'B' || tag === 'STRONG') bold = true;
  if (tag === 'I' || tag === 'EM') italic = true;
  const weight = el.style.fontWeight;
  if (weight) bold = weight === 'bold' || weight === 'bolder' || Number.parseInt(weight, 10) >= 600;
  const slant = el.style.fontStyle;
  if (slant) italic = slant === 'italic' || slant === 'oblique';
  return { bold, italic };
}

/** Mirrors `field.select()` of the textarea path: the editor opens with everything selected. */
export function selectAllContent(el: HTMLElement): void {
  const doc = el.ownerDocument;
  const selection = doc.getSelection();
  if (!selection) return;
  const range = doc.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Replaces the current selection with PLAIN text — the paste path: foreign HTML must never
 * enter the DOM the commit reads back. `insertText` (where implemented) keeps the browser's
 * native undo stack; the manual Range fallback covers jsdom.
 */
export function insertPlainText(root: HTMLElement, text: string): void {
  const doc = root.ownerDocument;
  if (typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, text)) return;
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const node = doc.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Line `<div>`s the current selection touches (empty when the selection is elsewhere). */
export function selectedLineDivs(root: HTMLElement): HTMLElement[] {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return [];
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return [];
  return Array.from(root.children).filter((child) => range.intersectsNode(child)) as HTMLElement[];
}

/**
 * Toggles the bullet marker on every line the selection touches — mixed selections become
 * all-bullet first, a second click removes them (Miro semantics). Root-level inline content
 * (browsers leave the first line bare) is wrapped into line divs first so there is always an
 * element to mark.
 */
export function toggleBulletLines(root: HTMLElement): void {
  ensureLineDivs(root);
  const lines = selectedLineDivs(root);
  if (lines.length === 0) return;
  const allBullets = lines.every((line) => line.classList.contains(NOTE_BULLET_CLASS));
  for (const line of lines) line.classList.toggle(NOTE_BULLET_CLASS, !allBullets);
}

/** Wraps stray root-level inline nodes into line `<div>`s (selection survives the move). */
export function ensureLineDivs(root: HTMLElement): void {
  const doc = root.ownerDocument;
  let wrapper: HTMLElement | null = null;
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && isBlockTag((node as Element).tagName)) {
      wrapper = null;
      continue;
    }
    if (!wrapper) {
      wrapper = doc.createElement('div');
      root.insertBefore(wrapper, node);
    }
    wrapper.appendChild(node);
  }
}

/** The Lucide icon of each alignment value. */
const ALIGN_ICONS: Record<'horizontal' | 'vertical', Record<string, LucideIconName>> = {
  horizontal: {
    left: 'text-align-start',
    center: 'text-align-center',
    right: 'text-align-end',
  },
  vertical: {
    top: 'align-vertical-justify-start',
    middle: 'align-vertical-justify-center',
    bottom: 'align-vertical-justify-end',
  },
};

/**
 * The floating formatting toolbar above the note editor. Buttons are addressed via
 * `data-action`; the two align CYCLE buttons start empty — `updateAlignButton` stamps the icon
 * of the CURRENT value (and re-stamps it after every cycle click).
 */
export function createNoteToolbar(
  doc: Document,
  onAction: (action: NoteToolbarAction) => void,
): HTMLElement {
  const toolbar = doc.createElement('div');
  toolbar.className = 'event-storming-note-toolbar';
  const add = (action: NoteToolbarAction, title: string, html: string): void => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.setAttribute('data-action', action);
    button.title = title;
    button.innerHTML = html;
    // Keep the editor's focus/selection: formatting applies to the CURRENT selection, and a
    // focus loss would commit-close the editor before the click even lands.
    button.addEventListener('mousedown', (e) => e.preventDefault());
    button.addEventListener('click', () => onAction(action));
    toolbar.appendChild(button);
  };
  add('note-bold', 'Bold (Cmd/Ctrl+B)', chromeIcon('bold'));
  add('note-italic', 'Italic (Cmd/Ctrl+I)', chromeIcon('italic'));
  add('note-bullet', 'Bullet list', chromeIcon('list'));
  const separator = doc.createElement('span');
  separator.className = 'event-storming-note-toolbar-separator';
  toolbar.appendChild(separator);
  add('note-align-horizontal', 'Horizontal alignment (click to cycle)', '');
  add('note-align-vertical', 'Vertical alignment (click to cycle)', '');
  return toolbar;
}

/** Stamps a cycle button with the icon/tooltip of the CURRENT alignment value. */
export function updateAlignButton(
  button: HTMLElement,
  axis: 'horizontal' | 'vertical',
  value: NoteAlignHorizontal | NoteAlignVertical,
): void {
  const icon = ALIGN_ICONS[axis][value];
  button.innerHTML = icon ? chromeIcon(icon) : '';
  button.title =
    axis === 'horizontal'
      ? `Horizontal alignment: ${value} (click to cycle)`
      : `Vertical alignment: ${value} (click to cycle)`;
}

/** Live preview of the note alignment on the contenteditable (flex column mirrors the canvas). */
export function applyAlignPreview(editor: HTMLElement, align: NoteAlignState): void {
  editor.style.textAlign = align.horizontal;
  editor.style.justifyContent =
    align.vertical === 'top' ? 'flex-start' : align.vertical === 'middle' ? 'center' : 'flex-end';
}
