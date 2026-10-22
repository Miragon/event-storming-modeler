import { UndrawableBoardError } from '@miragon/event-storming-schema-model';

/**
 * The toast for a file that did not open. A board beyond the canvas is a valid board, so the
 * usual advice to check it would send the user looking for a fault that isn't there: that toast
 * names the element and the number instead.
 */
export function openErrorText(fileName: string, error: unknown): string {
  if (error instanceof UndrawableBoardError) {
    return (
      `Couldn't open “${fileName}”. “${error.elementId}” lies beyond ±1e38 ` +
      `(${error.field} ${error.value}), too far out for the canvas.`
    );
  }
  return `Couldn't read “${fileName}”. Check that it contains a valid Event Storming board.`;
}
