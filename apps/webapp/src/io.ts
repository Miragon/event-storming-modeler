/**
 * File IO for the webapp: open Event Storming boards (.storm / .json) and export them as pictures
 * (SVG / PNG) or files (.storm / .json). Sharing an editable board is done via the URL (see
 * share.ts), not via the image.
 */
import { loadBoard, type EventStormingBoard } from '@miragon/event-storming-schema-model';
import { COLORS, type ImportWarning, type Modeler } from '@miragon/event-storming-renderer';

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

/** A file read and checked, ready to import: board text, or a validated board from JSON. */
export type BoardFile =
  | { readonly kind: 'dsl'; readonly text: string }
  | { readonly kind: 'board'; readonly board: EventStormingBoard };

/**
 * Reads a file as a board without touching the canvas. Throws with a descriptive message for a
 * picture or JSON that is no valid board; any other text is board text (the DSL keeps every line).
 */
export async function readBoardFile(file: File): Promise<BoardFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.png') || name.endsWith('.svg') || file.type.startsWith('image/')) {
    throw new Error('Images cannot be opened as boards: open a .storm or .json file.');
  }
  const text = await file.text();
  if (name.endsWith('.json')) return { kind: 'board', board: loadBoard(JSON.parse(text)) };
  return { kind: 'dsl', text };
}

/** Imports a board read by `readBoardFile`. */
export async function importBoardFile(
  boardFile: BoardFile,
  viewer: Modeler,
): Promise<ImportWarning[]> {
  const { warnings } =
    boardFile.kind === 'board'
      ? await viewer.importMap(boardFile.board)
      : await viewer.importDSL(boardFile.text);
  return warnings;
}

/** Reads a file and imports it into the modeler. Throws with a descriptive message on errors. */
export async function openFile(file: File, viewer: Modeler): Promise<ImportWarning[]> {
  return importBoardFile(await readBoardFile(file), viewer);
}

// ---------------------------------------------------------------------------
// PNG export (rasterize)
// ---------------------------------------------------------------------------

export interface PngOptions {
  /** Rasterization factor (default 2x). */
  readonly scale?: number;
  /** Export without a background fill (for slides/docs). */
  readonly transparent?: boolean;
}

/** Rasterizes the SVG to a PNG picture. */
export async function svgToPng(svg: string, options: PngOptions = {}): Promise<Blob> {
  const { width, height } = svgSize(svg);
  const png = await rasterize(svg, width, height, options.scale ?? 2, options.transparent ?? false);
  return new Blob([png as BlobPart], { type: 'image/png' });
}

function svgSize(svg: string): { width: number; height: number } {
  const w = /width="(\d+(?:\.\d+)?)"/.exec(svg);
  const h = /height="(\d+(?:\.\d+)?)"/.exec(svg);
  return { width: w ? Number(w[1]) : 1000, height: h ? Number(h[1]) : 700 };
}

async function rasterize(
  svg: string,
  width: number,
  height: number,
  scale: number,
  transparent: boolean,
): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.width = width;
    img.height = height;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render the SVG.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available.');
    if (!transparent) {
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG generation failed.');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}
