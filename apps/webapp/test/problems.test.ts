import { describe, expect, it } from 'vitest';
import { importWarningsText, problemItems } from '../src/problems.js';

describe('problemItems', () => {
  it('turns a parser finding’s line and source into the row’s place', () => {
    const items = problemItems(
      [
        {
          message: "Line 3: Couldn't read this line. It stays in the file unchanged.",
          line: 3,
          source: 'event B [abc, 20]',
        },
        { message: 'Line 9: A drawing can’t be resized.', line: 9 },
      ],
      () => true,
    );

    expect(items).toEqual([
      {
        severity: 'warning',
        message: "Couldn't read this line. It stays in the file unchanged.",
        location: 'Line 3 · event B [abc, 20]',
      },
      { severity: 'warning', message: 'A drawing can’t be resized.', location: 'Line 9' },
    ]);
  });

  it('keeps an element only while the board has it, so a click on the row can select it', () => {
    const items = problemItems(
      [
        { message: '“actor_a” is pinned to “x”, which isn’t on the board.', elementId: 'actor_a' },
        {
          message: 'The arrow “arrow_1” has an end that isn’t on the board.',
          elementId: 'arrow_1',
        },
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
