import type { WebviewStateApi } from '@miragon/modeler-shell/vscode/webview';

const TYPE_CAPTIONS_KEY = 'typeCaptionsVisible';

function stateRecord(api: WebviewStateApi): Record<string, unknown> {
  const state = api.getState();
  return state !== null && typeof state === 'object' && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : {};
}

export function readTypeCaptionsVisible(api: WebviewStateApi): boolean | undefined {
  const value = stateRecord(api)[TYPE_CAPTIONS_KEY];
  return typeof value === 'boolean' ? value : undefined;
}

/** Merges into the webview state, so the shell's own key (view, legend) survives. */
export function writeTypeCaptionsVisible(api: WebviewStateApi, visible: boolean): void {
  api.setState({ ...stateRecord(api), [TYPE_CAPTIONS_KEY]: visible });
}
