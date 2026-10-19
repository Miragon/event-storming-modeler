import type { ProblemItem } from '@miragon/modeler-shell';
import type { ImportWarning } from '@miragon/event-storming-renderer';

/** The renderer writes a parser finding as `Line 12: <message>`; the line is the row's place. */
const LINE_PREFIX = /^Line \d+: /;

/** "Line 12 · Order Placed -> Nowhere": the line, and what stands on it. */
function lineLocation(line: number, source: string | undefined): string {
  const text = source?.trim();
  return text ? `Line ${line} · ${text}` : `Line ${line}`;
}

/**
 * Import warnings as rows of the problems list (guide §5.10): the message, its line and source
 * below it, and the element a click on the row selects where the board still has it.
 */
export function problemItems(
  warnings: readonly ImportWarning[],
  hasElement: (id: string) => boolean,
): ProblemItem[] {
  return warnings.map((warning) => {
    const elementId =
      warning.elementId && hasElement(warning.elementId) ? warning.elementId : undefined;
    const line = warning.line;
    return {
      severity: 'warning',
      message: line === undefined ? warning.message : warning.message.replace(LINE_PREFIX, ''),
      ...(line === undefined ? {} : { location: lineLocation(line, warning.source) }),
      ...(elementId ? { elementId } : {}),
    };
  });
}

/** The toast after an import with warnings points at the pill (guide §9). */
export function importWarningsText(count: number, pillLabel: string): string {
  const warnings = count === 1 ? '1 warning' : `${count} warnings`;
  return `Imported with ${warnings}. Details under “${pillLabel}” bottom left.`;
}
