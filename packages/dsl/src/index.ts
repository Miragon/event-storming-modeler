export { parseDSL, parseDSLWithDiagnostics } from './parser.js';
export type { ParseDiagnostic, ParseResult } from './parser.js';
export { serializeDSL } from './serializer.js';
export { boardToJSON, boardFromJSON, loadBoard } from './json.js';

// Lexer helpers (for advanced consumers / tests)
export { parseCoords, slug, keywordOf } from './lexer.js';
export type { ParsedCoords } from './lexer.js';
