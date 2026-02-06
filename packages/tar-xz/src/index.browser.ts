/**
 * tar-xz — Create and extract tar.xz archives (Browser)
 *
 * Buffer-based API for browsers with XZ compression powered by node-liblzma WASM.
 *
 * @packageDocumentation
 */

// Re-export Browser API
export { createTarXz, extractTarXz, listTarXz } from './browser/index.js';
export type { CreateHeaderOptions, PaxAttributes } from './tar/index.js';

// Re-export low-level TAR utilities for advanced usage
export {
  applyPaxAttributes,
  BLOCK_SIZE,
  calculatePadding,
  createEndOfArchive,
  createHeader,
  createPaxData,
  createPaxHeaderBlocks,
  needsPaxHeaders,
  parseHeader,
  parsePaxData,
} from './tar/index.js';
// Re-export types
export {
  type BrowserCreateOptions,
  type BrowserExtractOptions,
  type ExtractedFile,
  type TarEntry,
  TarEntryType,
  type TarEntryWithData,
  type TarInputFile,
} from './types.js';
