import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parseDSLWithDiagnostics } from '@miragon/event-storming-dsl';
import type { EventStormingBoard } from '@miragon/event-storming-schema-model';
import { formatVsCodeSmoke, runVsCodeSmoke } from '@miragon/modeler-shell/testing/vscode-electron';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { WEBVIEW_THEMES } from '../src/themes.js';

const run = promisify(execFile);
const extensionSources = fileURLToPath(new URL('..', import.meta.url));
const screenshotDirectory = fileURLToPath(
  new URL('../../../test-results/vscode-smoke', import.meta.url),
);
const fixtureFile = new URL('smoke.storm', import.meta.url);
const vsceCli = createRequire(import.meta.url).resolve('@vscode/vsce/vsce');
const requestedVsCodeVersion = process.env.VSCODE_SMOKE_VERSION;
const keepVsCodeProfile = process.env.VSCODE_SMOKE_KEEP === '1';

let workDirectory: string | undefined;
let packagedExtension = '';

function parseBoard(text: string): EventStormingBoard {
  const { board, diagnostics } = parseDSLWithDiagnostics(text);
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map(({ line, message }) => `line ${line}: ${message}`).join('; '));
  }
  return board;
}

// The driver takes the first read of the file that differs from the fixture. VS Code truncates the
// file before it writes the new text, so that read can be empty or cut short, and an empty board
// parses without a diagnostic: only the fixture's elements plus the new one, with all the arrows,
// count as the saved board.
function savedBoardParser(fixtureBoard: EventStormingBoard): (text: string) => EventStormingBoard {
  const elements = fixtureBoard.elements.length + 1;
  const arrows = fixtureBoard.edges.length;
  return (text) => {
    const board = parseBoard(text);
    if (board.elements.length !== elements || board.edges.length !== arrows) {
      throw new Error(
        `${board.elements.length} elements and ${board.edges.length} arrows in ${text.length} characters, ` +
          `expected ${elements} and ${arrows} (read while VS Code was still writing the file?)`,
      );
    }
    return board;
  };
}

// The release's packaging command (vsce runs vscode:prepublish, the production build), unpacked
// outside the repository: VS Code then loads exactly what the VSIX ships, and a module missing
// from the bundle cannot be found in a node_modules further up.
beforeAll(async () => {
  await rm(screenshotDirectory, { recursive: true, force: true });
  workDirectory = await mkdtemp(join(tmpdir(), 'event-storming-vsix-'));
  const vsix = join(workDirectory, 'event-storming-modeler.vsix');
  await run(process.execPath, [vsceCli, 'package', '--no-dependencies', '-o', vsix], {
    cwd: extensionSources,
  });
  await run('unzip', ['-q', vsix, 'extension/*', '-d', workDirectory]);
  packagedExtension = join(workDirectory, 'extension');
}, 300_000);

afterAll(async () => {
  if (workDirectory) await rm(workDirectory, { recursive: true, force: true });
});

// The first run downloads VS Code: about 320 to 360 MB, 0.9 GB unpacked, kept in the OS cache.
// One retry, in a fresh VS Code: the driver's save read can still race VS Code's write (see
// savedBoardParser), and a slow runner can miss a theme switch now and then.
it(
  'opens, edits, saves, undoes and themes a board in a real VS Code',
  { timeout: 600_000, retry: 1 },
  async () => {
    const fixtureText = await readFile(fixtureFile, 'utf8');

    const result = await runVsCodeSmoke({
      extensionPath: packagedExtension,
      fixture: { fileName: 'smoke.storm', text: fixtureText },
      parse: savedBoardParser(parseBoard(fixtureText)),
      themes: WEBVIEW_THEMES,
      name: 'event-storming',
      screenshotDir: screenshotDirectory,
      keepTemporaryFiles: keepVsCodeProfile,
      ...(requestedVsCodeVersion ? { vscodeVersion: requestedVsCodeVersion } : {}),
      log: (line) => console.log(`[vscode-smoke] ${line}`),
    });
    console.log(formatVsCodeSmoke(result));

    expect(result.failures).toEqual([]);
  },
);
