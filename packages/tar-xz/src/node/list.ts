/**
 * Node.js TAR listing with XZ decompression — v6 AsyncIterable API
 */

import type { TarInputNode } from '../internal/to-async-iterable.js';
import type { TarEntry } from '../types.js';
import { parseTar } from './tar-parser.js';
import { streamXz } from './xz-helpers.js';

/**
 * List the contents of a tar.xz archive.
 *
 * Returns an `AsyncIterable<TarEntry>` yielding each entry's metadata.
 * Entry content is skipped — use `extract()` if you need the data.
 * Memory usage is bounded to O(BLOCK_SIZE) — no content bytes are held.
 *
 * @example
 * ```ts
 * for await (const entry of list(input)) {
 *   console.log(entry.name, entry.size);
 * }
 * ```
 */
export async function* list(input: TarInputNode): AsyncIterable<TarEntry> {
  const xzStream = streamXz(input);
  for await (const ev of parseTar(xzStream, 'list')) {
    if (ev.kind === 'entry') yield ev.entry;
    // ev.kind === 'end' → loop exits naturally
    // ev.kind === 'chunk' → never emitted in list mode
  }
}
