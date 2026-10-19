import { describe, expect, it } from 'vitest';
import { importWarningText } from '../src/io/warnings.js';

describe('importWarningText', () => {
  it('adds a parser finding’s source line to its message', () => {
    expect(
      importWarningText({
        message: "Line 4: Couldn't read this line. It stays in the file unchanged.",
        line: 4,
        source: 'event A [abc, 20]',
      }),
    ).toBe(
      "Line 4: Couldn't read this line. It stays in the file unchanged. (“event A [abc, 20]”)",
    );
  });

  it('keeps any other warning as it is', () => {
    expect(
      importWarningText({ message: 'The arrow “arrow_1” has an end that isn’t on the board.' }),
    ).toBe('The arrow “arrow_1” has an end that isn’t on the board.');
  });
});
