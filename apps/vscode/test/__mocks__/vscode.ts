/**
 * Thin in-repo mock of the ambient `vscode` module. Vitest aliases `vscode` to this file (see
 * vitest.config.ts) so the extension-host + protocol logic can be unit-tested in Node without
 * launching VS Code. Only the API surface the host actually uses is implemented.
 *
 * The extension source stays typed against the real `@types/vscode`; tests drive behaviour through
 * the exported `vscodeMock` control surface (which is NOT part of the real API) and the concrete
 * classes below. Because vitest resolves both `'vscode'` (aliased) and a relative import of this
 * file to the same module id, a listener the host registers and an event a test fires share state.
 */

export class Disposable {
  constructor(private readonly _dispose: () => void) {}
  static from(...disposables: Array<{ dispose(): unknown }>): Disposable {
    return new Disposable(() => {
      for (const disposable of disposables) disposable.dispose();
    });
  }
  dispose(): void {
    this._dispose();
  }
}

export class EventEmitter<T> {
  private readonly listeners = new Set<(e: T) => void>();
  readonly event = (listener: (e: T) => void): Disposable => {
    this.listeners.add(listener);
    return new Disposable(() => this.listeners.delete(listener));
  };
  fire(data: T): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  listenerCount(): number {
    return this.listeners.size;
  }
  dispose(): void {
    this.listeners.clear();
  }
}

export class CancellationError extends Error {
  constructor() {
    super('Canceled');
    this.name = 'CancellationError';
  }
}

/** Minimal cancellation source: tests pass `.token` to a provider and call `cancel()` to trip it. */
export class CancellationTokenSource {
  private readonly emitter = new EventEmitter<void>();
  readonly token = {
    isCancellationRequested: false,
    onCancellationRequested: (listener: () => void): Disposable => this.emitter.event(listener),
  };
  get isCancellationRequested(): boolean {
    return this.token.isCancellationRequested;
  }
  cancel(): void {
    this.token.isCancellationRequested = true;
    this.emitter.fire();
  }
}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}

export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(start: Position, end: Position);
  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  constructor(
    startOrLine: Position | number,
    endOrCharacter: Position | number,
    endLine?: number,
    endCharacter?: number,
  ) {
    if (typeof startOrLine === 'number' && typeof endOrCharacter === 'number') {
      this.start = new Position(startOrLine, endOrCharacter);
      this.end = new Position(endLine ?? startOrLine, endCharacter ?? endOrCharacter);
    } else {
      this.start = startOrLine as Position;
      this.end = endOrCharacter as Position;
    }
  }
}

export interface RecordedEdit {
  uri: unknown;
  range: Range;
  text: string;
}

export class WorkspaceEdit {
  readonly edits: RecordedEdit[] = [];
  replace(uri: unknown, range: Range, text: string): void {
    this.edits.push({ uri, range, text });
  }
}

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}
  get fsPath(): string {
    return this.path;
  }
  static parse(value: string): Uri {
    const idx = value.indexOf(':');
    return idx >= 0 ? new Uri(value.slice(0, idx), value.slice(idx + 1)) : new Uri('file', value);
  }
  static file(path: string): Uri {
    return new Uri('file', path);
  }
  static joinPath(base: Uri, ...segments: string[]): Uri {
    const joined = [base.path.replace(/\/$/, ''), ...segments].join('/');
    return new Uri(base.scheme, joined);
  }
  with(change: { scheme?: string; path?: string }): Uri {
    return new Uri(change.scheme ?? this.scheme, change.path ?? this.path);
  }
  toString(): string {
    return `${this.scheme}:${this.path}`;
  }
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  source?: string;
  constructor(
    readonly range: Range,
    readonly message: string,
    readonly severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  ) {}
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
}

export enum ColorThemeKind {
  Light = 1,
  Dark = 2,
  HighContrast = 3,
  HighContrastLight = 4,
}

export class MockDiagnosticCollection {
  private readonly entries = new Map<string, readonly Diagnostic[]>();
  disposed = false;
  constructor(readonly name: string) {}
  set(uri: Uri, diagnostics: readonly Diagnostic[]): void {
    this.entries.set(uri.toString(), diagnostics);
  }
  get(uri: Uri): readonly Diagnostic[] | undefined {
    return this.entries.get(uri.toString());
  }
  has(uri: Uri): boolean {
    return this.entries.has(uri.toString());
  }
  delete(uri: Uri): void {
    this.entries.delete(uri.toString());
  }
  clear(): void {
    this.entries.clear();
  }
  dispose(): void {
    this.disposed = true;
    this.entries.clear();
  }
}

// The buses the host subscribes to; tests fire them via `vscodeMock`.
const docChangeEmitter = new EventEmitter<{ document: unknown; contentChanges: unknown[] }>();
const colorThemeEmitter = new EventEmitter<{ kind: number }>();
const configurationEmitter = new EventEmitter<{ affectsConfiguration(section: string): boolean }>();

const configuration = new Map<string, unknown>();

export const workspace = {
  workspaceFolders: undefined as ReadonlyArray<{ uri: Uri }> | undefined,
  onDidChangeTextDocument(
    listener: (e: { document: unknown; contentChanges: unknown[] }) => void,
  ): Disposable {
    return docChangeEmitter.event(listener);
  },
  onDidChangeConfiguration(
    listener: (e: { affectsConfiguration(section: string): boolean }) => void,
  ): Disposable {
    return configurationEmitter.event(listener);
  },
  getConfiguration(section?: string): { get<T>(key: string): T | undefined } {
    return {
      get: <T>(key: string) => configuration.get(section ? `${section}.${key}` : key) as T,
    };
  },
  applyEdit(_edit: WorkspaceEdit): Promise<boolean> {
    return Promise.resolve(true);
  },
  fs: {
    readFile(_uri: Uri): Promise<Uint8Array> {
      return Promise.resolve(new Uint8Array());
    },
    writeFile(_uri: Uri, _content: Uint8Array): Promise<void> {
      return Promise.resolve();
    },
    createDirectory(_uri: Uri): Promise<void> {
      return Promise.resolve();
    },
    delete(_uri: Uri): Promise<void> {
      return Promise.resolve();
    },
  },
};

interface RegisteredEditor {
  readonly viewType: string;
  readonly provider: unknown;
  readonly options: unknown;
}

const registeredEditors: RegisteredEditor[] = [];
const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
const executedCommands: unknown[][] = [];
const diagnosticCollections: MockDiagnosticCollection[] = [];

export const window = {
  activeColorTheme: { kind: ColorThemeKind.Light as number },
  activeTextEditor: undefined as { document: { uri: Uri } } | undefined,
  onDidChangeActiveColorTheme(listener: (theme: { kind: number }) => void): Disposable {
    return colorThemeEmitter.event(listener);
  },
  showInformationMessage(_message: string, ..._items: string[]): Promise<string | undefined> {
    return Promise.resolve(undefined);
  },
  showErrorMessage(_message: string, ..._items: string[]): Promise<string | undefined> {
    return Promise.resolve(undefined);
  },
  showSaveDialog(_options: unknown): Promise<Uri | undefined> {
    return Promise.resolve(undefined);
  },
  registerCustomEditorProvider(viewType: string, provider: unknown, options?: unknown): Disposable {
    registeredEditors.push({ viewType, provider, options });
    return new Disposable(() => {});
  },
};

export const commands = {
  registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable {
    registeredCommands.set(command, callback);
    return new Disposable(() => {
      if (registeredCommands.get(command) === callback) registeredCommands.delete(command);
    });
  },
  executeCommand(command: string, ...rest: unknown[]): Promise<unknown> {
    executedCommands.push([command, ...rest]);
    return Promise.resolve(undefined);
  },
};

export const languages = {
  createDiagnosticCollection(name: string): MockDiagnosticCollection {
    const collection = new MockDiagnosticCollection(name);
    diagnosticCollections.push(collection);
    return collection;
  },
};

/**
 * Test control surface — NOT part of the real `vscode` API. Import from the relative mock path
 * (never from `'vscode'`) so the extension source stays typed against `@types/vscode`.
 */
export const vscodeMock = {
  /**
   * Simulate an editor change event (echo or external edit) for the given document; pass no
   * content changes for the event VS Code fires when only the dirty state changes (save).
   */
  fireDidChangeTextDocument(document: unknown, contentChanges: unknown[] = [{}]): void {
    docChangeEmitter.fire({ document, contentChanges });
  },
  /** Switch the color theme the way VS Code does: the kind changes, then the event fires. */
  setColorThemeKind(kind: ColorThemeKind): void {
    window.activeColorTheme = { kind };
    colorThemeEmitter.fire(window.activeColorTheme);
  },
  setConfiguration(key: string, value: unknown): void {
    configuration.set(key, value);
    configurationEmitter.fire({ affectsConfiguration: (section) => key.startsWith(section) });
  },
  /** The provider instance a `register(...)` call handed to `registerCustomEditorProvider`. */
  lastRegisteredProvider<T>(): T {
    const last = registeredEditors[registeredEditors.length - 1];
    if (!last) throw new Error('No custom editor provider has been registered.');
    return last.provider as T;
  },
  registeredEditors(): readonly RegisteredEditor[] {
    return registeredEditors;
  },
  registeredCommandIds(): string[] {
    return [...registeredCommands.keys()];
  },
  /** Every `vscode.commands.executeCommand` call, as `[command, ...args]`. */
  executedCommands(): readonly unknown[][] {
    return executedCommands;
  },
  /** Runs a command the way the Command Palette does (without arguments). */
  runCommand(command: string, ...args: unknown[]): unknown {
    const callback = registeredCommands.get(command);
    if (!callback) throw new Error(`Command ${command} is not registered.`);
    return callback(...args);
  },
  diagnosticCollections(): readonly MockDiagnosticCollection[] {
    return diagnosticCollections;
  },
  /** Reset shared state between tests. */
  reset(): void {
    registeredEditors.length = 0;
    registeredCommands.clear();
    executedCommands.length = 0;
    diagnosticCollections.length = 0;
    configuration.clear();
    docChangeEmitter.dispose();
    colorThemeEmitter.dispose();
    configurationEmitter.dispose();
    window.activeColorTheme = { kind: ColorThemeKind.Light };
    window.activeTextEditor = undefined;
    workspace.workspaceFolders = undefined;
  },
};
