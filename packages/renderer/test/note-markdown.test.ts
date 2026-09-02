import { describe, it, expect } from 'vitest';
import {
  parseNoteMarkdown,
  serializeNoteMarkdown,
  plainNoteText,
} from '../src/draw/note-markdown.js';

const run = (text: string, bold = false, italic = false) => ({ text, bold, italic });

describe('parseNoteMarkdown: canonical markers', () => {
  it('parses plain text as one regular run per line', () => {
    expect(parseNoteMarkdown('hello world')).toEqual([
      { bullet: false, runs: [run('hello world')] },
    ]);
    expect(parseNoteMarkdown('a\nb')).toEqual([
      { bullet: false, runs: [run('a')] },
      { bullet: false, runs: [run('b')] },
    ]);
  });

  it('parses **bold**, *italic* and ***bold italic*** runs', () => {
    expect(parseNoteMarkdown('**bold**')).toEqual([{ bullet: false, runs: [run('bold', true)] }]);
    expect(parseNoteMarkdown('*italic*')).toEqual([
      { bullet: false, runs: [run('italic', false, true)] },
    ]);
    expect(parseNoteMarkdown('***both***')).toEqual([
      { bullet: false, runs: [run('both', true, true)] },
    ]);
  });

  it('mixes styled and regular runs within one line', () => {
    expect(parseNoteMarkdown('see **bold** and *italic* here')).toEqual([
      {
        bullet: false,
        runs: [
          run('see '),
          run('bold', true),
          run(' and '),
          run('italic', false, true),
          run(' here'),
        ],
      },
    ]);
  });

  it('strips the `- ` marker on bullet lines and keeps inline styling', () => {
    expect(parseNoteMarkdown('- **todo** item')).toEqual([
      { bullet: true, runs: [run('todo', true), run(' item')] },
    ]);
    // No trailing space after `-` -> not a bullet, plain literal.
    expect(parseNoteMarkdown('-nope')).toEqual([{ bullet: false, runs: [run('-nope')] }]);
  });

  it('keeps unmatched markers literal (never crashes, never eats text)', () => {
    expect(parseNoteMarkdown('**open')).toEqual([{ bullet: false, runs: [run('**open')] }]);
    expect(parseNoteMarkdown('a * b')).toEqual([{ bullet: false, runs: [run('a * b')] }]);
    expect(parseNoteMarkdown('****')).toEqual([{ bullet: false, runs: [run('****')] }]);
    expect(parseNoteMarkdown('**')).toEqual([{ bullet: false, runs: [run('**')] }]);
    // Empty content between markers is not a span.
    expect(parseNoteMarkdown('a **** b')).toEqual([{ bullet: false, runs: [run('a **** b')] }]);
  });

  it('parses empty labels and empty lines to empty run lists', () => {
    expect(parseNoteMarkdown('')).toEqual([{ bullet: false, runs: [] }]);
    expect(parseNoteMarkdown('a\n\nb')).toEqual([
      { bullet: false, runs: [run('a')] },
      { bullet: false, runs: [] },
      { bullet: false, runs: [run('b')] },
    ]);
  });

  it('merges adjacent same-style spans into one run', () => {
    expect(parseNoteMarkdown('*a**b*')).toEqual([
      { bullet: false, runs: [run('ab', false, true)] },
    ]);
  });
});

describe('serializeNoteMarkdown: exact inverse with canonical markers', () => {
  it('serializes runs back to canonical markers', () => {
    expect(
      serializeNoteMarkdown([
        {
          bullet: false,
          runs: [run('see '), run('bold', true), run(' or ', false), run('both', true, true)],
        },
      ]),
    ).toBe('see **bold** or ***both***');
  });

  it('prefixes bullet lines with `- `', () => {
    expect(
      serializeNoteMarkdown([
        { bullet: true, runs: [run('first', true)] },
        { bullet: true, runs: [run('second')] },
      ]),
    ).toBe('- **first**\n- second');
  });

  it('merges adjacent same-style runs and drops empty runs', () => {
    expect(
      serializeNoteMarkdown([
        { bullet: false, runs: [run('a', true), run('', false), run('b', true), run('c')] },
      ]),
    ).toBe('**ab**c');
  });

  it('serializes empty lines to empty strings', () => {
    expect(serializeNoteMarkdown([{ bullet: false, runs: [] }])).toBe('');
    expect(serializeNoteMarkdown([{ bullet: true, runs: [] }])).toBe('- ');
  });
});

describe('note markdown round-trip: canonicalization fixed point', () => {
  const canonical = [
    '',
    'plain text',
    '**bold**',
    '*italic*',
    '***both***',
    '- bullet',
    '- **todo** item\nsecond *line*',
    'a * b ** c',
    '**open',
    'multi\n\nline\n- with **bullet**',
  ];

  it.each(canonical)('serialize(parse(x)) is a fixed point for %j', (label) => {
    expect(serializeNoteMarkdown(parseNoteMarkdown(label))).toBe(label);
  });

  const nonCanonical = [
    // Adjacent same-style spans collapse into one canonical span.
    ['*a**b*', '*ab*'],
    // Adjacent bold spans likewise.
    ['**a****b**', '**ab**'],
  ] as const;

  it.each(nonCanonical)('canonicalizes %j to %j and is then stable', (input, expected) => {
    const once = serializeNoteMarkdown(parseNoteMarkdown(input));
    expect(once).toBe(expected);
    expect(serializeNoteMarkdown(parseNoteMarkdown(once))).toBe(once);
  });
});

describe('plainNoteText: what the measurement sees', () => {
  it('strips markers and renders bullets as a `• ` prefix', () => {
    expect(plainNoteText('**Check legal**\n- tomorrow')).toBe('Check legal\n• tomorrow');
    expect(plainNoteText('*a* **b** ***c***')).toBe('a b c');
  });

  it('keeps literal text (incl. unmatched markers) verbatim', () => {
    expect(plainNoteText('a * b')).toBe('a * b');
    expect(plainNoteText('**open')).toBe('**open');
    expect(plainNoteText('')).toBe('');
  });
});
