// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import EventStormingLabelEditing from '../src/label-editing/EventStormingLabelEditing.js';
import { domToNoteMarkdown, noteMarkdownToDom } from '../src/label-editing/note-editor-dom.js';
import { noteMetrics } from '../src/draw/styles.js';
import type EventStormingModeling from '../src/modeling/EventStormingModeling.js';
import type { EventStormingShape } from '../src/model/di-types.js';

describe('noteMarkdownToDom: markdown -> editor DOM', () => {
  const render = (label: string): HTMLElement => {
    const root = document.createElement('div');
    noteMarkdownToDom(root, label);
    return root;
  };

  it('renders bold/italic runs as <b>/<i>, the combined form nested', () => {
    const root = render('**Check** *legal* ***now***');
    expect(root.children).toHaveLength(1);
    expect(root.children[0]!.innerHTML).toBe('<b>Check</b> <i>legal</i> <b><i>now</i></b>');
  });

  it('renders one div per line; bullet lines as .bullet rows with the marker stripped', () => {
    const root = render('head\n- item one\n- item two');
    expect(root.children).toHaveLength(3);
    expect(root.children[0]!.className).toBe('');
    expect(root.children[1]!.className).toBe('bullet');
    expect(root.children[1]!.textContent).toBe('item one');
    expect(root.children[2]!.className).toBe('bullet');
  });

  it('keeps empty lines as visible placeholder-<br> rows', () => {
    const root = render('a\n\nb');
    expect(root.children).toHaveLength(3);
    expect(root.children[1]!.innerHTML).toBe('<br>');
  });

  it('leaves unmatched markers literal (never eats text)', () => {
    const root = render('*x');
    expect(root.querySelector('i')).toBeNull();
    expect(root.textContent).toBe('*x');
  });
});

describe('domToNoteMarkdown: editor DOM -> canonical markdown', () => {
  const rootWith = (html: string): HTMLElement => {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
  };

  it('emits canonical markers for b/i and the nested combined form', () => {
    expect(domToNoteMarkdown(rootWith('<div><b>Check</b> legal</div>'))).toBe('**Check** legal');
    expect(domToNoteMarkdown(rootWith('<div><b><i>x</i></b> y</div>'))).toBe('***x*** y');
  });

  it('understands browser-flavored formatting: strong/em and styled spans', () => {
    expect(domToNoteMarkdown(rootWith('<div><strong>a</strong> <em>b</em></div>'))).toBe(
      '**a** *b*',
    );
    expect(domToNoteMarkdown(rootWith('<div><span style="font-weight: 600">x</span></div>'))).toBe(
      '**x**',
    );
    expect(
      domToNoteMarkdown(rootWith('<div><span style="font-style: italic">x</span></div>')),
    ).toBe('*x*');
    // Chrome un-formats INSIDE a styled ancestor with font-weight: normal spans.
    expect(
      domToNoteMarkdown(rootWith('<div><b>a<span style="font-weight: normal">x</span></b></div>')),
    ).toBe('**a**x');
  });

  it('turns .bullet rows into `- ` lines', () => {
    expect(domToNoteMarkdown(rootWith('<div class="bullet">item</div><div>plain</div>'))).toBe(
      '- item\nplain',
    );
  });

  it('reads bare root text and <br> breaks (browser first-line flavor), ignoring trailing <br>', () => {
    expect(domToNoteMarkdown(rootWith('a<br>b'))).toBe('a\nb');
    expect(domToNoteMarkdown(rootWith('<div>a<br></div>'))).toBe('a');
  });

  it('splits raw newlines inside one text node (plain-text paste)', () => {
    const root = document.createElement('div');
    root.appendChild(document.createTextNode('x\ny'));
    expect(domToNoteMarkdown(root)).toBe('x\ny');
  });

  it('reads placeholder-<br> divs as empty lines', () => {
    expect(domToNoteMarkdown(rootWith('<div>a</div><div><br></div><div>b</div>'))).toBe('a\n\nb');
  });

  it('round-trips canonical markdown through the DOM unchanged', () => {
    const samples = [
      'plain',
      '**Check legal**',
      '- tomorrow',
      '***both*** *i* **b**\n- **x** y\n\nend',
    ];
    for (const sample of samples) {
      const root = document.createElement('div');
      noteMarkdownToDom(root, sample);
      expect(domToNoteMarkdown(root)).toBe(sample);
    }
  });
});

/** Minimal DI mocks — the editor only touches canvas geometry and modeling. */
function noteHarness(label = 'Note', box?: { width: number; height: number }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const canvas = {
    getContainer: () => container,
    zoom: () => 1,
    viewbox: () => ({ x: 0, y: 0 }),
  } as unknown as Canvas;
  const eventBus = { on: () => {} } as unknown as EventBus;
  const calls: { updateLabel: unknown[][]; updateProperties: unknown[][] } = {
    updateLabel: [],
    updateProperties: [],
  };
  const modeling = {
    updateLabel: (...args: unknown[]) => calls.updateLabel.push(args),
    updateProperties: (...args: unknown[]) => calls.updateProperties.push(args),
  } as unknown as EventStormingModeling;
  const editing = new EventStormingLabelEditing(eventBus, canvas, modeling);
  const metrics = noteMetrics(label);
  const element = {
    id: 'note_1',
    eventStormingType: 'note',
    eventStormingLabel: label,
    x: 100,
    y: 100,
    width: box?.width ?? metrics.width,
    height: box?.height ?? metrics.height,
  } as unknown as EventStormingShape;
  editing.activate(element);
  const editor = container.querySelector<HTMLElement>('.event-storming-note-editor')!;
  const toolbar = container.querySelector<HTMLElement>('.event-storming-note-toolbar')!;
  return { container, editing, calls, element, editor, toolbar };
}

describe('EventStormingLabelEditing: WYSIWYG note editor', () => {
  let harness: ReturnType<typeof noteHarness>;

  beforeEach(() => {
    harness = noteHarness();
  });

  afterEach(() => {
    harness.editing.cancel();
    harness.container.remove();
    delete (document as { execCommand?: unknown }).execCommand;
  });

  it('opens a contenteditable overlay with the floating toolbar (no textarea)', () => {
    expect(harness.editor).not.toBeNull();
    expect(harness.editor.contentEditable).toBe('true');
    expect(harness.container.querySelector('textarea')).toBeNull();
    const actions = Array.from(harness.toolbar.querySelectorAll('button')).map((button) =>
      button.getAttribute('data-action'),
    );
    expect(actions).toEqual([
      'note-bold',
      'note-italic',
      'note-bullet',
      'note-align-horizontal',
      'note-align-vertical',
    ]);
    expect(harness.toolbar.querySelector('.event-storming-note-toolbar-separator')).not.toBeNull();
  });

  it('is centered over the note and sized to its footprint (like the textarea path)', () => {
    const { element, editor } = harness;
    expect(editor.style.left).toBe(`${element.x + element.width / 2}px`);
    expect(editor.style.top).toBe(`${element.y + element.height / 2}px`);
    expect(editor.style.transform).toBe('translate(-50%, -50%)');
    expect(editor.style.minWidth).toBe(`${element.width}px`);
  });

  it('shows the label formatting live on open (markdown -> DOM)', () => {
    harness.editing.cancel();
    harness = noteHarness('**Check** legal\n- tomorrow');
    expect(harness.editor.querySelector('b')?.textContent).toBe('Check');
    expect(harness.editor.children[1]!.className).toBe('bullet');
    expect(harness.editor.children[1]!.textContent).toBe('tomorrow');
  });

  it('wires the bold/italic buttons to the selection commands', () => {
    const exec = vi.fn(() => true);
    (document as { execCommand?: unknown }).execCommand = exec;
    harness.toolbar
      .querySelector('[data-action="note-bold"]')!
      .dispatchEvent(new MouseEvent('click'));
    expect(exec).toHaveBeenCalledWith('bold', false);
    harness.toolbar
      .querySelector('[data-action="note-italic"]')!
      .dispatchEvent(new MouseEvent('click'));
    expect(exec).toHaveBeenCalledWith('italic', false);
  });

  it('handles Cmd/Ctrl+B and Cmd/Ctrl+I while editing', () => {
    const exec = vi.fn(() => true);
    (document as { execCommand?: unknown }).execCommand = exec;
    harness.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true }));
    expect(exec).toHaveBeenCalledWith('bold', false);
    harness.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', ctrlKey: true }));
    expect(exec).toHaveBeenCalledWith('italic', false);
  });

  it('toggles bullets on the selected lines and reflects the state on the button', () => {
    harness.editing.cancel();
    harness = noteHarness('a\nb'); // opens with everything selected
    const button = harness.toolbar.querySelector('[data-action="note-bullet"]')!;
    button.dispatchEvent(new MouseEvent('click'));
    expect(Array.from(harness.editor.children).map((line) => line.className)).toEqual([
      'bullet',
      'bullet',
    ]);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.dispatchEvent(new MouseEvent('click'));
    expect(Array.from(harness.editor.children).map((line) => line.className)).toEqual(['', '']);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('cycles horizontal alignment left -> center -> right and previews it live', () => {
    const button = harness.toolbar.querySelector<HTMLElement>(
      '[data-action="note-align-horizontal"]',
    )!;
    expect(button.innerHTML).toContain('<svg'); // icon of the CURRENT value stamped on open
    expect(button.title).toContain('left');
    button.dispatchEvent(new MouseEvent('click'));
    expect(harness.editor.style.textAlign).toBe('center');
    expect(button.title).toContain('center');
    button.dispatchEvent(new MouseEvent('click'));
    expect(harness.editor.style.textAlign).toBe('right');
    button.dispatchEvent(new MouseEvent('click'));
    expect(harness.editor.style.textAlign).toBe('left');
  });

  it('cycles vertical alignment top -> middle -> bottom via flex justification', () => {
    const button = harness.toolbar.querySelector<HTMLElement>(
      '[data-action="note-align-vertical"]',
    )!;
    expect(harness.editor.style.justifyContent).toBe('flex-start');
    button.dispatchEvent(new MouseEvent('click'));
    expect(harness.editor.style.justifyContent).toBe('center');
    expect(button.title).toContain('middle');
    button.dispatchEvent(new MouseEvent('click'));
    expect(harness.editor.style.justifyContent).toBe('flex-end');
  });

  it('commits label + alignment as ONE updateProperties (single undo step), resizing auto boxes', () => {
    const { element, editor, toolbar, calls } = harness;
    editor.innerHTML = '<div><b>Check legal</b></div>';
    toolbar
      .querySelector('[data-action="note-align-horizontal"]')!
      .dispatchEvent(new MouseEvent('click')); // left -> center
    editor.dispatchEvent(new FocusEvent('blur'));

    expect(calls.updateLabel).toEqual([]);
    expect(calls.updateProperties).toHaveLength(1);
    const [target, properties] = calls.updateProperties[0]!;
    expect(target).toBe(element);
    const metrics = noteMetrics('**Check legal**');
    const old = noteMetrics('Note');
    expect(properties).toStrictEqual({
      eventStormingLabel: '**Check legal**',
      width: metrics.width,
      height: metrics.height,
      x: 100 + old.width / 2 - metrics.width / 2,
      y: 100 + old.height / 2 - metrics.height / 2,
      alignHorizontal: 'center',
      alignVertical: undefined, // default axis collapses to an ABSENT DI prop
    });
  });

  it('commits an alignment-only change without touching the label or the box', () => {
    harness.toolbar
      .querySelector('[data-action="note-align-vertical"]')!
      .dispatchEvent(new MouseEvent('click')); // top -> middle
    harness.editor.dispatchEvent(new FocusEvent('blur'));

    expect(harness.calls.updateProperties).toHaveLength(1);
    expect(harness.calls.updateProperties[0]![1]).toStrictEqual({
      alignHorizontal: undefined,
      alignVertical: 'middle',
    });
  });

  it('keeps manual note boxes: no resize props on a relabel of a hand-sized note', () => {
    harness.editing.cancel();
    const metrics = noteMetrics('Note');
    harness = noteHarness('Note', { width: metrics.width + 40, height: metrics.height });
    harness.editor.innerHTML = '<div>bigger text now</div>';
    harness.editor.dispatchEvent(new FocusEvent('blur'));
    expect(harness.calls.updateProperties).toHaveLength(1);
    expect(harness.calls.updateProperties[0]![1]).toStrictEqual({
      eventStormingLabel: 'bigger text now',
    });
  });

  it('commits nothing when neither text nor alignment changed', () => {
    harness.editor.dispatchEvent(new FocusEvent('blur'));
    expect(harness.calls.updateProperties).toEqual([]);
    expect(harness.container.querySelector('.event-storming-note-editor')).toBeNull();
  });

  it('Escape discards: no model calls, editor and toolbar removed', () => {
    harness.editor.innerHTML = '<div>changed</div>';
    harness.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(harness.calls.updateProperties).toEqual([]);
    expect(harness.container.querySelector('.event-storming-note-editor')).toBeNull();
    expect(harness.container.querySelector('.event-storming-note-toolbar')).toBeNull();
  });

  it('Cmd/Ctrl+Enter commits like the textarea path', () => {
    harness.editor.innerHTML = '<div>saved</div>';
    harness.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
    expect(harness.calls.updateProperties).toHaveLength(1);
    expect(harness.calls.updateProperties[0]![1]).toMatchObject({ eventStormingLabel: 'saved' });
    expect(harness.container.querySelector('.event-storming-note-editor')).toBeNull();
  });

  it('sanitizes the committed markdown with the shared sanitizeLabel (DSL metachars defused)', () => {
    harness.editor.innerHTML = '<div>A -&gt; B; [x]</div>';
    harness.editor.dispatchEvent(new FocusEvent('blur'));
    expect(harness.calls.updateProperties[0]![1]).toMatchObject({
      eventStormingLabel: 'A → B, (x)',
    });
  });

  it('paste is sanitized to plain text — foreign HTML never enters the DOM', () => {
    const paste = new Event('paste', { cancelable: true }) as Event & {
      clipboardData?: { getData: (type: string) => string };
    };
    paste.clipboardData = {
      getData: (type) => (type === 'text/plain' ? 'plain <b>pasted</b>\nsecond' : '<b>rich</b>'),
    };
    harness.editor.dispatchEvent(paste); // replaces the select-all selection
    expect(paste.defaultPrevented).toBe(true);
    expect(harness.editor.querySelector('b')).toBeNull();

    harness.editor.dispatchEvent(new FocusEvent('blur'));
    expect(harness.calls.updateProperties[0]![1]).toMatchObject({
      eventStormingLabel: 'plain <b>pasted</b>\nsecond',
    });
  });
});
