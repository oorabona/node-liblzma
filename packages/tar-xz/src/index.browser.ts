/**
 * tar-xz v6 — Universal stream-first API (Browser)
 *
 * Browser entry point. Same function names as the Node.js entry point.
 * XZ compression powered by node-liblzma WASM.
 *
 * @packageDocumentation
 */

// Re-export Browser API
export { create, extract, list } from './browser/index.js';
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
  type CreateOptions,
  type ExtractOptions,
  type TarEntry,
  TarEntryType,
  type TarEntryWithData,
  type TarInput,
  type TarSourceFile,
} from './types.js';
