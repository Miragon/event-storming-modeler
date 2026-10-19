import { describe, expect, it } from 'vitest';
import { importWarningsText, problemItems } from '../src/problems.js';

describe('problemItems', () => {
  it('turns a parser finding’s line into the row’s place', () => {
    const items = problemItems(
      [{ message: 'Line 3: Line could not be interpreted — "event B [abc, 20]"' }],
      () => true,
    );

    expect(items).toEqual([
      {
        severity: 'warning',
        message: 'Line could not be interpreted — "event B [abc, 20]"',
        location: 'Line 3',
      },
    ]);
  });

  it('keeps an element only while the board has it, so a click on the row can select it', () => {
    const items = problemItems(
      [
        { message: 'Element actor_a: attachedTo host "x" missing.', elementId: 'actor_a' },
        { message: 'Edge arrow_1: endpoint missing.', elementId: 'arrow_1' },
      ],
      (id) => id === 'actor_a',
    );

    expect(items.map((item) => item.elementId)).toEqual(['actor_a', undefined]);
    expect(items[1]).not.toHaveProperty('elementId');
    expect(items[0]).not.toHaveProperty('location');
  });
});

describe('importWarningsText', () => {
  it('counts the warnings and names the pill (guide §9)', () => {
    expect(importWarningsText(1, '1 problem')).toBe(
      'Imported with 1 warning. Details under “1 problem” bottom left.',
    );
    expect(importWarningsText(2, '2 problems')).toBe(
      'Imported with 2 warnings. Details under “2 problems” bottom left.',
    );
  });
});
