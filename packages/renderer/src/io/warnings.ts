import type { ImportWarning } from './types.js';

/**
 * One import warning as a single line of text, for hosts that take plain strings (the
 * collaborative contract, a console): the message, then a parser finding's source line.
 */
export function importWarningText(warning: ImportWarning): string {
  return warning.source === undefined
    ? warning.message
    : `${warning.message} (“${warning.source}”)`;
}
