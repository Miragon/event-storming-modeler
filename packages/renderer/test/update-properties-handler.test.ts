import { describe, it, expect } from 'vitest';
import UpdatePropertiesHandler, {
  type UpdatePropertiesContext,
} from '../src/modeling/cmd/UpdatePropertiesHandler.js';

function element(overrides: Record<string, unknown> = {}) {
  const incoming = [{ id: 'arrow_in', waypoints: [] }];
  const outgoing = [{ id: 'arrow_out', waypoints: [] }];
  return {
    id: 'cmd_place_order',
    eventStormingType: 'command',
    x: 100,
    y: 100,
    width: 130,
    height: 90,
    incoming,
    outgoing,
    ...overrides,
  } as unknown as UpdatePropertiesContext['element'];
}

describe('UpdatePropertiesHandler: dirty elements', () => {
  // Regression: retyping a sticky to a different-size kind (setStickyKind) left attached arrows
  // rendered against the OLD rectangle until an unrelated re-render.
  it('marks attached connections dirty when geometry changes (execute)', () => {
    const el = element();
    const context: UpdatePropertiesContext = {
      element: el,
      properties: { eventStormingType: 'aggregate', width: 180, height: 110, x: 75, y: 90 },
    };
    const dirty = new UpdatePropertiesHandler().execute(context);
    expect(dirty).toEqual([el, ...(el['incoming'] as []), ...(el['outgoing'] as [])]);
  });

  it('marks attached connections dirty on revert of a geometry change', () => {
    const el = element();
    const handler = new UpdatePropertiesHandler();
    const context: UpdatePropertiesContext = {
      element: el,
      properties: { width: 180, height: 110 },
    };
    handler.execute(context);
    const dirty = handler.revert(context);
    expect(el['width']).toBe(130);
    expect(el['height']).toBe(90);
    expect(dirty).toEqual([el, ...(el['incoming'] as []), ...(el['outgoing'] as [])]);
  });

  it('returns only the element for non-geometry changes', () => {
    const el = element();
    const handler = new UpdatePropertiesHandler();
    const context: UpdatePropertiesContext = {
      element: el,
      properties: { eventStormingLabel: 'Ship Order' },
    };
    expect(handler.execute(context)).toEqual([el]);
    expect(handler.revert(context)).toEqual([el]);
    expect(el['eventStormingLabel']).toBeUndefined();
  });

  it('applies and reverts values including undefined (delete) semantics', () => {
    const el = element({ color: '#ff0000' });
    const handler = new UpdatePropertiesHandler();
    const context: UpdatePropertiesContext = { element: el, properties: { color: undefined } };
    handler.execute(context);
    expect('color' in el).toBe(false);
    handler.revert(context);
    expect(el['color']).toBe('#ff0000');
  });
});
