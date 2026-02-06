/**
 * tar-xz — Create and extract tar.xz archives
 *
 * Node.js streaming API with XZ compression powered by node-liblzma.
 *
 * @packageDocumentation
 */

// Re-export Node.js API
export { create, extract, extractToMemory, list } from './node/index.js';
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
  type ExtractedFile,
  type ExtractOptions,
  type ListOptions,
  type TarEntry,
  TarEntryType,
  type TarEntryWithData,
  type TarInputFile,
} from './types.js';
