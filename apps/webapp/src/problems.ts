import type { ProblemItem } from '@miragon/modeler-shell';
import type { ImportWarning } from '@miragon/event-storming-renderer';

/** The renderer writes a parser finding as `Line 12: <message>`; the line is the row's place. */
const LINE_PREFIX = /^Line (\d+): /;

/**
 * Import warnings as rows of the problems list (guide §5.10): the message, its line below it, and
 * the element a click on the row selects where the board still has it.
 */
export function problemItems(
  warnings: readonly ImportWarning[],
  hasElement: (id: string) => boolean,
): ProblemItem[] {
  return warnings.map((warning) => {
    const line = LINE_PREFIX.exec(warning.message);
    const elementId =
      warning.elementId && hasElement(warning.elementId) ? warning.elementId : undefined;
    return {
      severity: 'warning',
      message: line ? warning.message.slice(line[0].length) : warning.message,
      ...(line ? { location: `Line ${line[1]}` } : {}),
      ...(elementId ? { elementId } : {}),
    };
  });
}

/** The toast after an import with warnings points at the pill (guide §9). */
export function importWarningsText(count: number, pillLabel: string): string {
  const warnings = count === 1 ? '1 warning' : `${count} warnings`;
  return `Imported with ${warnings}. Details under “${pillLabel}” bottom left.`;
}
