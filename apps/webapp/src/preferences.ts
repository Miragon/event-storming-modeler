/*
 * View preferences of this browser, not board content: they stay out of the share link. A blocked
 * storage (private mode, a policy) keeps the default and the choice for the page.
 */
const TYPE_CAPTIONS_KEY = 'event-storming.typeCaptions';

export function readTypeCaptionsVisible(): boolean | undefined {
  try {
    const stored = localStorage.getItem(TYPE_CAPTIONS_KEY);
    return stored === null ? undefined : stored !== '0';
  } catch {
    return undefined;
  }
}

export function writeTypeCaptionsVisible(visible: boolean): void {
  try {
    localStorage.setItem(TYPE_CAPTIONS_KEY, visible ? '1' : '0');
  } catch {
    // The choice still holds for this page.
  }
}
