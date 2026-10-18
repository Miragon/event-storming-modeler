// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import EventBus from 'diagram-js/lib/core/EventBus';
import EventStormingKeyboard, {
  type EventStormingKeyboardConfig,
} from '../src/keyboard/EventStormingKeyboard.js';

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function harness(config?: EventStormingKeyboardConfig) {
  const container = document.createElement('div');
  const canvasSvg = document.createElement('div');
  container.append(canvasSvg);
  const outside = document.createElement('button');
  document.body.append(container, outside);

  const selected = [{ id: 'event_order_placed' }];
  const eventBus = new EventBus();
  const commandStack = { undo: vi.fn(), redo: vi.fn() };
  const modeling = { removeElements: vi.fn(), moveElements: vi.fn() };
  const copyPaste = { copy: vi.fn(() => true), paste: vi.fn(() => true), duplicate: vi.fn() };
  const lassoTool = { activateSelection: vi.fn() };

  new EventStormingKeyboard(
    config,
    { getContainer: () => container } as never,
    commandStack as never,
    { get: () => selected } as never,
    modeling as never,
    copyPaste as never,
    { createNew: vi.fn() } as never,
    { start: vi.fn() } as never,
    { getLastMoveEvent: () => null } as never,
    lassoTool as never,
    eventBus,
  );

  cleanups.push(() => {
    eventBus.fire('diagram.destroy');
    container.remove();
    outside.remove();
  });

  return { container, canvasSvg, outside, commandStack, modeling, copyPaste, lassoTool };
}

function press(target: EventTarget, key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  target.dispatchEvent(event);
  return event;
}

describe('EventStormingKeyboard: target rules', () => {
  // A tab stop on the container would sit, unnamed, between the palette and the canvas <svg>.
  it('puts no tabindex on the canvas container', () => {
    const { container } = harness();
    expect(container.hasAttribute('tabindex')).toBe(false);
  });

  it('acts on keys aimed at the canvas', () => {
    const { canvasSvg, modeling } = harness();
    const event = press(canvasSvg, 'Delete');
    expect(event.defaultPrevented).toBe(true);
    expect(modeling.removeElements).toHaveBeenCalledTimes(1);
  });

  // Nothing focused: the single-key tools must work without clicking the canvas first.
  it('acts on keys whose target is the body or the document element', () => {
    const { lassoTool, modeling } = harness();
    press(document.body, 'l');
    expect(lassoTool.activateSelection).toHaveBeenCalledTimes(1);
    press(document.documentElement, 'Backspace');
    expect(modeling.removeElements).toHaveBeenCalledTimes(1);
  });

  // The zoom panel's buttons, an inspector or a host's own chrome live outside the container.
  it('ignores keys whose target lies outside the canvas container', () => {
    const { outside, modeling, commandStack, lassoTool } = harness();
    for (const [key, modifiers] of [
      ['Delete', {}],
      ['ArrowDown', {}],
      ['l', {}],
      ['z', { metaKey: true }],
    ] as const) {
      const event = press(outside, key, modifiers);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(modeling.removeElements).not.toHaveBeenCalled();
    expect(modeling.moveElements).not.toHaveBeenCalled();
    expect(lassoTool.activateSelection).not.toHaveBeenCalled();
    expect(commandStack.undo).not.toHaveBeenCalled();
  });

  // The shell's menu and palette stop or prevent the keys they consume before they bubble here.
  it('ignores keys another listener already handled (defaultPrevented)', () => {
    const { canvasSvg, modeling } = harness();
    canvasSvg.addEventListener('keydown', (event) => event.preventDefault(), { once: true });
    press(canvasSvg, 'ArrowDown');
    expect(modeling.moveElements).not.toHaveBeenCalled();
  });

  it('keeps ignoring text fields inside the canvas (label editor)', () => {
    const { container, modeling } = harness();
    const field = document.createElement('textarea');
    container.append(field);
    const event = press(field, 'Backspace');
    expect(event.defaultPrevented).toBe(false);
    expect(modeling.removeElements).not.toHaveBeenCalled();
  });
});

describe('EventStormingKeyboard: undo/redo keys', () => {
  it('binds Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y by default', () => {
    const { canvasSvg, commandStack } = harness();
    expect(press(canvasSvg, 'z', { metaKey: true }).defaultPrevented).toBe(true);
    expect(press(canvasSvg, 'Z', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(press(canvasSvg, 'y', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(commandStack.undo).toHaveBeenCalledTimes(1);
    expect(commandStack.redo).toHaveBeenCalledTimes(2);
  });

  // The VS Code document owns the history: the keys must reach VS Code unprevented.
  it('binds none of them with undoRedoKeys: false and keeps the other keys', () => {
    const { canvasSvg, commandStack, copyPaste } = harness({ undoRedoKeys: false });
    expect(press(canvasSvg, 'z', { metaKey: true }).defaultPrevented).toBe(false);
    expect(press(canvasSvg, 'z', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press(canvasSvg, 'Z', { metaKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(press(canvasSvg, 'y', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(commandStack.undo).not.toHaveBeenCalled();
    expect(commandStack.redo).not.toHaveBeenCalled();

    expect(press(canvasSvg, 'c', { metaKey: true }).defaultPrevented).toBe(true);
    expect(copyPaste.copy).toHaveBeenCalledTimes(1);
  });
});
