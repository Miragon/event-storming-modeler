import { describe, expect, it } from 'vitest';
import { readShellState, writeShellState } from '@miragon/modeler-shell/vscode/webview';
import { readTypeCaptionsVisible, writeTypeCaptionsVisible } from '../../src/webview/state.js';

function stateApi(initial: unknown) {
  let state = initial;
  return {
    getState: () => state,
    setState: (next: unknown) => {
      state = next;
    },
  };
}

const VIEW = { viewbox: { x: 1, y: 2, width: 300, height: 200 }, userMoved: true };

describe('webview state', () => {
  it('keeps the type captions at the top-level key next to the shell state', () => {
    const api = stateApi(undefined);

    writeShellState(api, { view: VIEW });
    writeTypeCaptionsVisible(api, false);

    expect(api.getState()).toEqual({ modelerShell: { view: VIEW }, typeCaptionsVisible: false });
    expect(readShellState(api).view).toEqual(VIEW);
    expect(readTypeCaptionsVisible(api)).toBe(false);
  });

  it('survives a later write of the shell', () => {
    const api = stateApi(undefined);

    writeTypeCaptionsVisible(api, false);
    writeShellState(api, { view: VIEW });

    expect(readTypeCaptionsVisible(api)).toBe(false);
  });

  it('reads nothing from a missing or malformed state', () => {
    expect(readTypeCaptionsVisible(stateApi(undefined))).toBeUndefined();
    expect(readTypeCaptionsVisible(stateApi('broken'))).toBeUndefined();
    expect(readTypeCaptionsVisible(stateApi({ typeCaptionsVisible: 'no' }))).toBeUndefined();
  });
});
