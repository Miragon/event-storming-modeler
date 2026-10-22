import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
const requestedVsCodeVersion = process.env.VSCODE_VERSION;
const keepVsCodeProfile = process.env.VSCODE_SMOKE_KEEP === '1';
const prebuiltVsix = process.env.VSCODE_SMOKE_VSIX;

let workDirectory: string | undefined;
let packagedExtension = '';

function parseBoard(text: string): EventStormingBoard {
  const { board, diagnostics } = parseDSLWithDiagnostics(text);
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map(({ line, message }) => `line ${line}: ${message}`).join('; '));
  }
  return board;
}

// Any whole lines of a board parse without a diagnostic, an empty file too: only the fixture's
// elements plus the new one, with all the arrows, count as the saved board.
function savedBoardParser(fixtureBoard: EventStormingBoard): (text: string) => EventStormingBoard {
  const elements = fixtureBoard.elements.length + 1;
  const arrows = fixtureBoard.edges.length;
  return (text) => {
    const board = parseBoard(text);
    if (board.elements.length !== elements || board.edges.length !== arrows) {
      throw new Error(
        `${board.elements.length} elements and ${board.edges.length} arrows in ${text.length} characters, ` +
          `expected ${elements} and ${arrows}`,
      );
    }
    return board;
  };
}

async function packageExtension(vsix: string): Promise<string> {
  await run(process.execPath, [vsceCli, 'package', '--no-dependencies', '-o', vsix], {
    cwd: extensionSources,
  });
  return vsix;
}

// The release's packaging command (vsce runs vscode:prepublish, the production build), unpacked
// outside the repository: VS Code then loads exactly what the VSIX ships, and a module missing
// from the bundle cannot be found in a node_modules further up. The release passes the VSIX it is
// about to publish instead, so the smoked file and the uploaded file are the same.
beforeAll(async () => {
  await rm(screenshotDirectory, { recursive: true, force: true });
  workDirectory = await mkdtemp(join(tmpdir(), 'event-storming-vsix-'));
  const vsix = prebuiltVsix
    ? resolve(prebuiltVsix)
    : await packageExtension(join(workDirectory, 'event-storming-modeler.vsix'));
  await run('unzip', ['-q', vsix, 'extension/*', '-d', workDirectory]);
  packagedExtension = join(workDirectory, 'extension');
}, 300_000);

afterAll(async () => {
  if (workDirectory) await rm(workDirectory, { recursive: true, force: true });
});

// VS Code applies a color theme once it notices that its settings file changed. Once in 35 Docker
// runs it did not, and the workbench kept the previous theme through the driver's whole wait: such a
// run, and only such a run, gets a second one in a fresh VS Code. Any other failure fails at once.
const MISSED_THEME_SWITCH = /^themes: .+: the workbench never switched/;
const MISSED_THEME_SWITCH_ERROR = 'VS Code missed a theme switch';

function onlyMissedThemeSwitches(failures: readonly string[]): boolean {
  return failures.length > 0 && failures.every((failure) => MISSED_THEME_SWITCH.test(failure));
}

// The first run downloads VS Code: about 320 to 360 MB, 0.9 GB unpacked, kept in the OS cache.
it(
  'opens, edits, saves, undoes and themes a board in a real VS Code',
  {
    timeout: 600_000,
    retry: { count: 1, condition: new RegExp(`^${MISSED_THEME_SWITCH_ERROR}`) },
  },
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

    if (onlyMissedThemeSwitches(result.failures)) {
      throw new Error(`${MISSED_THEME_SWITCH_ERROR}: ${result.failures.join('; ')}`);
    }
    expect(result.failures, result.failures.join('\n')).toEqual([]);
  },
);
