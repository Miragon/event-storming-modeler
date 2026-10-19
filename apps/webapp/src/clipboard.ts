/**
 * Copies text that is still being computed (a compressed share link). Call it synchronously inside
 * the click: Safari allows clipboard writes only during the user gesture, and a ClipboardItem whose
 * value is a promise keeps the gesture while the text is produced. Rejects when the clipboard is
 * missing (an insecure origin) or refuses the write, so the caller never claims a copy blindly.
 */
export async function copyTextWhenReady(text: Promise<string>): Promise<void> {
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (!clipboard) throw new Error('The clipboard is not available here.');
  if (typeof clipboard.write === 'function' && typeof ClipboardItem !== 'undefined') {
    try {
      const blob = text.then((value) => new Blob([value], { type: 'text/plain' }));
      await clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      return;
    } catch {
      // Older engines reject a promise in a ClipboardItem; a plain write may still work.
    }
  }
  await clipboard.writeText(await text);
}
