/** What the web app downloads; `png-transparent` is the 4× PNG without a background. */
export type DownloadKind = 'png' | 'png-transparent' | 'svg' | 'json' | 'storm';

const FALLBACK_FILE_BASE = 'event-storming-board';
const DEFAULT_TITLES = new Set(['', 'new board', 'untitled board']);

/** "Order Checkout" -> "order-checkout": ASCII, lower case, dashes, at most 60 characters. */
function slugify(text: string): string {
  return text
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
}

/** The download name of the board with this title, e.g. "order-checkout.png". */
export function boardFileName(title: string | undefined, kind: DownloadKind): string {
  const trimmed = title?.trim() ?? '';
  const base =
    (DEFAULT_TITLES.has(trimmed.toLowerCase()) ? '' : slugify(trimmed)) || FALLBACK_FILE_BASE;
  return kind === 'png-transparent' ? `${base}-transparent@4x.png` : `${base}.${kind}`;
}
