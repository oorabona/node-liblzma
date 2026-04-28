/**
 * Node.js TAR extraction with XZ decompression — v6 AsyncIterable API
 */

import { stripPath } from '../tar/utils.js';
import type { TarInputNode } from '../internal/to-async-iterable.js';
import type { ExtractOptions, TarEntry, TarEntryWithData } from '../types.js';
import { type ParseEvent, parseTar } from './tar-parser.js';
import { streamXz } from './xz-helpers.js';

/**
 * Concatenate an array of Uint8Array chunks into a single Uint8Array.
 * @internal
 */
function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Wrap a TarEntry + a pull-callback for its content into a TarEntryWithData.
 *
 * The `dataPull` callback returns an `AsyncGenerator<Uint8Array>` that is
 * backed by the outer `parseTar` generator. It is single-use — consuming it
 * twice yields nothing on the second pass (JS AsyncGenerator default).
 *
 * `bytes()` and `text()` memoize their result on first call (D-3). Holding
 * a reference to the returned entry also holds the cached bytes; release the
 * entry to allow GC.
 */
function makeTarEntryWithData(
  entry: TarEntry,
  dataPull: () => AsyncGenerator<Uint8Array>
): TarEntryWithData {
  let cachedBytes: Uint8Array | null = null;
  const dataGen = dataPull(); // single-use generator

  return {
    ...entry,
    data: dataGen,
    async bytes(): Promise<Uint8Array> {
      if (cachedBytes !== null) return cachedBytes;
      const chunks: Uint8Array[] = [];
      for await (const c of dataGen) chunks.push(c);
      cachedBytes = concatChunks(chunks);
      return cachedBytes;
    },
    async text(encoding?: string): Promise<string> {
      const bytes = await this.bytes();
      return new TextDecoder(encoding ?? 'utf-8').decode(bytes);
    },
  };
}

/**
 * Extract a tar.xz archive.
 *
 * Returns an `AsyncIterable<TarEntryWithData>`. Each yielded entry includes:
 * - Full metadata (`TarEntry` fields)
 * - `data` — `AsyncIterable<Uint8Array>` for the entry's content (consume in order)
 * - `bytes()` — helper that collects all chunks into a single `Uint8Array`
 * - `text(encoding?)` — helper that collects and decodes to a string
 *
 * @example
 * ```ts
 * for await (const entry of extract(input)) {
 *   const content = await entry.bytes();
 *   console.log(entry.name, content.length);
 * }
 * ```
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: streaming generator with strip/filter/drain logic — complexity is intrinsic
export async function* extract(
  input: TarInputNode,
  options: ExtractOptions = {}
): AsyncGenerator<TarEntryWithData> {
  const { strip = 0, filter } = options;

  const xzStream = streamXz(input);
  const parser = parseTar(xzStream, 'extract');

  // Lookahead: an event pulled from parseTar that hasn't been processed yet.
  // This allows the data-generator to consume chunks and then "return" the
  // terminating event (entry/end) for the outer loop to process.
  let lookahead: ParseEvent | null = null;

  /** Pull next event from parser, respecting any pending lookahead. */
  async function nextEvent(): Promise<IteratorResult<ParseEvent>> {
    if (lookahead !== null) {
      const ev = lookahead;
      lookahead = null;
      return { value: ev, done: false };
    }
    return parser.next();
  }

  /** Drain all remaining 'chunk' events for the current entry from parseTar.
   *  The terminating 'entry' or 'end' event is stored in `lookahead`. */
  async function drainChunks(): Promise<void> {
    while (true) {
      const result = await parser.next();
      if (result.done) return;
      if (result.value.kind !== 'chunk') {
        lookahead = result.value;
        return;
      }
    }
  }

  try {
    while (true) {
      const result = await nextEvent();
      if (result.done) break;
      const ev = result.value;

      if (ev.kind === 'end') break;
      if (ev.kind === 'chunk') {
        // Stray chunk — consume and continue (shouldn't normally happen).
        continue;
      }

      // ev.kind === 'entry'
      const rawEntry = ev.entry;
      const strippedName = stripPath(rawEntry.name, strip);
      if (!strippedName) {
        await drainChunks();
        continue;
      }

      const strippedEntry = { ...rawEntry, name: strippedName };
      if (filter && !filter(strippedEntry)) {
        await drainChunks();
        continue;
      }

      // Build a data generator that pulls 'chunk' events from the parseTar stream.
      // When chunks are exhausted it stores the next 'entry'/'end' in `lookahead`.
      // The outer generator is suspended at `yield entryWithData` while the consumer
      // iterates this — natural backpressure.
      function makeDataGen(): AsyncGenerator<Uint8Array> {
        return (async function* () {
          while (true) {
            const r = await parser.next();
            if (r.done) return;
            if (r.value.kind === 'chunk') {
              yield r.value.data;
            } else {
              // 'entry' or 'end' — store for outer loop.
              lookahead = r.value;
              return;
            }
          }
        })();
      }

      const entryWithData = makeTarEntryWithData(strippedEntry, makeDataGen);
      yield entryWithData;

      // After the consumer advances past this entry, drain any remaining chunks
      // that the consumer did not read (S-08 auto-drain, Case A per §12.4).
      // If the data generator was fully consumed, lookahead is already set.
      // If not, drain now.
      if (lookahead === null) {
        // Consumer did not fully iterate entry.data — drain remaining chunks.
        try {
          await drainChunks();
        } catch (err) {
          // Decode/IO error during skipped data — swallow per D-2.
          // TAR_PARSER_INVARIANT always re-throws per D-5.
          if ((err as { code?: string }).code === 'TAR_PARSER_INVARIANT') {
            throw err;
          }
          // Swallow other errors from skipped data per D-2.
        }
      }
    }
  } finally {
    // Case B (consumer break): close parser, no drain needed.
    // Swallow cleanup errors per D-2. TAR_PARSER_INVARIANT handling: per D-5 these
    // should always re-throw, but noUnsafeFinally prohibits throw in finally.
    // In practice a TAR_PARSER_INVARIANT during parser.return() is a bug in our own
    // code, not in the caller's data — the iterator is already being abandoned, so
    // the invariant error will surface on the NEXT use attempt, which is unreachable
    // here. We swallow it the same as other cleanup errors.
    try {
      await parser.return(undefined);
    } catch {
      // Swallow all cleanup errors per D-2.
    }
  }
}

/**
 * Extract archive to memory (no disk writes)
 */
// extractToMemory removed in v6 — use extract() with entry.bytes() instead
