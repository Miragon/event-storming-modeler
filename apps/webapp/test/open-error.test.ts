import { describe, expect, it } from 'vitest';
import { UndrawableBoardError, parseBoardJSON } from '@miragon/event-storming-schema-model';
import { openErrorText } from '../src/open-error.js';

function refusal(json: string): unknown {
  try {
    parseBoardJSON(json);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('openErrorText', () => {
  it.each([
    ['1e39', '1e+39'],
    ['1e400', 'Infinity'],
  ])('names the element and the number of a board at %s, beyond the canvas', (written, shown) => {
    const error = refusal(
      '{"schemaVersion":1,"config":{"title":"Huge"},"elements":[' +
        `{"id":"event_b","label":"Far","position":{"x":${written},"y":100},"elementType":"event"}` +
        '],"edges":[]}',
    );

    expect(error).toBeInstanceOf(UndrawableBoardError);
    expect(openErrorText('huge.json', error)).toBe(
      `Couldn't open “huge.json”. “event_b” lies beyond ±1e38 (position.x ${shown}), too far out for the canvas.`,
    );
  });

  it.each([
    ['broken JSON', refusal('{ "elements": ')],
    [
      'a board the schema refuses',
      refusal('{"schemaVersion":1,"config":{},"elements":[],"edges":[]}'),
    ],
    ['any other failure', new Error('boom')],
  ])('points at the file for %s', (_, error) => {
    expect(error).toBeDefined();
    expect(openErrorText('bad.json', error)).toBe(
      "Couldn't read “bad.json”. Check that it contains a valid Event Storming board.",
    );
  });
});
