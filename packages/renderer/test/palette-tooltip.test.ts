import { describe, it, expect, vi } from 'vitest';
import EventBus from 'diagram-js/lib/core/EventBus';
import type { HoverTooltipConfig } from 'diagram-js/lib/features/hover-tooltip/HoverTooltip';
import type { PaletteEntries } from 'diagram-js/lib/features/palette/PaletteProvider';
import EventStormingPaletteTooltip, {
  PALETTE_TOOLTIP_GAP,
} from '../src/palette/EventStormingPaletteTooltip.js';

function tooltipHarness(initialEntries: PaletteEntries) {
  const eventBus = new EventBus();
  let entries = initialEntries;
  const palette = { getEntries: () => entries };
  const hoverTooltip = { add: vi.fn() };
  new EventStormingPaletteTooltip(eventBus, palette as never, hoverTooltip as never);

  const container = {} as HTMLElement;
  eventBus.fire('palette.create', { container });
  const config = hoverTooltip.add.mock.calls[0]?.[0] as HoverTooltipConfig;
  return {
    eventBus,
    hoverTooltip,
    container,
    config,
    replaceEntries: (next: PaletteEntries) => {
      entries = next;
    },
  };
}

function paletteEntryElement(action: string, rect: Partial<DOMRect> = {}): HTMLElement {
  return {
    getAttribute: (name: string) => (name === 'data-action' ? action : null),
    getBoundingClientRect: () => rect,
  } as unknown as HTMLElement;
}

const NO_ACTION = {};

const ENTRIES: PaletteEntries = {
  'create.event': { title: 'Domain Event — E', action: NO_ACTION },
  'lasso-tool': { title: 'Selection tool', shortcut: 'L', action: NO_ACTION },
  untitled: { action: NO_ACTION },
};

describe('EventStormingPaletteTooltip', () => {
  it('registers one hover source on the palette container for its entries', () => {
    const { hoverTooltip, container, config } = tooltipHarness(ENTRIES);
    expect(hoverTooltip.add).toHaveBeenCalledTimes(1);
    expect(config.container).toBe(container);
    expect(config.selector).toBe('.djs-palette-entries .entry');
  });

  // The palette is a horizontal bar: diagram-js' default right-hand placement would cover the
  // neighbouring entry, so the tooltip hangs below, centred on the hovered entry.
  it('places the tooltip below the hovered entry, horizontally centred', () => {
    const { config } = tooltipHarness(ENTRIES);
    const entry = paletteEntryElement('create.event', {
      left: 100,
      width: 40,
      top: 12,
      height: 40,
      bottom: 52,
    });
    expect(config.getPosition(entry)).toEqual({
      x: 120,
      y: 52 + PALETTE_TOOLTIP_GAP,
      placement: 'bottom',
    });
  });

  it('renders title and shortcut of the hovered entry, nothing for entries without a title', () => {
    const { config } = tooltipHarness(ENTRIES);
    const content = config.getContent(paletteEntryElement('lasso-tool'));
    expect(content?.props).toMatchObject({ title: 'Selection tool', shortcut: 'L' });
    expect(config.getContent(paletteEntryElement('untitled'))).toBeNull();
    expect(config.getContent(paletteEntryElement('unknown'))).toBeNull();
  });

  it('follows palette rebuilds (level switch) via palette.changed', () => {
    const { config, eventBus, replaceEntries } = tooltipHarness(ENTRIES);
    replaceEntries({ 'create.hotspot': { title: 'Hotspot', action: NO_ACTION } });
    eventBus.fire('palette.changed');
    expect(config.getContent(paletteEntryElement('create.hotspot'))?.props).toMatchObject({
      title: 'Hotspot',
    });
    expect(config.getContent(paletteEntryElement('create.event'))).toBeNull();
  });
});
