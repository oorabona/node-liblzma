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

/**
 * Wrap a TarEntry + a pull-callback for its content into a TarEntryWithData.
 *
 * The `dataPull` callback returns an `AsyncGenerator<Uint8Array>` that is
 * backed by the outer `parseTar` generator. It is single-use — consuming it
 * twice yields nothing on the second pass (JS AsyncGenerator default).
 *
 * `bytes()` throws if `entry.data` was already iterated — call `bytes()` before
 * iterating `entry.data` if you need the full content (D-3 / F-2 contract).
 * `text()` uses `Buffer.toString()` and accepts any `BufferEncoding` (including
 * `'base64'`, `'hex'`, `'latin1'`) — same contract as the pre-v6.1.0 behavior.
 * Holding a reference to the returned entry also holds the cached bytes; release
 * the entry to allow GC.
 */
function makeTarEntryWithData(
  entry: TarEntry,
  dataPull: () => AsyncGenerator<Uint8Array>
): TarEntryWithData {
  let cachedBytes: Uint8Array | null = null;
  let dataIterStarted = false;
  const dataGen = dataPull(); // single-use generator

  // Wrap dataGen so that direct iteration of `entry.data` is detected.
  // When the consumer calls `for await (const chunk of entry.data)`, the
  // wrapper sets `dataIterStarted = true` so that a subsequent `bytes()` call
  // can throw instead of silently returning incomplete bytes.
  // Wrap dataGen behind a plain AsyncIterable so that:
  //   1. `for await` iteration sets `dataIterStarted = true` (F-2 guard)
  //   2. The type is `AsyncIterable<Uint8Array>` — matching TarEntryWithData.data
  //      and avoiding the `[Symbol.asyncDispose]` requirement that TS/lib.esnext
  //      adds to the full `AsyncGenerator` interface (Explicit Resource Management).
  const dataWrapper: AsyncIterable<Uint8Array> = {
    [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
      dataIterStarted = true;
      return dataGen;
    },
  };

  return {
    ...entry,
    data: dataWrapper,
    async bytes(): Promise<Uint8Array> {
      if (cachedBytes !== null) return cachedBytes;
      if (dataIterStarted) {
        throw new Error(
          'entry.data already iterated; bytes() cannot recover full content — call bytes() before iterating entry.data'
        );
      }
      dataIterStarted = true;

      // Alloc-once optimisation: entry.size is known from the TAR header, so we
      // pre-allocate a single buffer and set() each arriving chunk at its running
      // offset. This halves peak memory vs the chunks-array-then-concat pattern
      // (no intermediate array + final copy simultaneously resident).
      if (entry.size === 0) {
        cachedBytes = new Uint8Array(0);
        return cachedBytes;
      }

      const buf = new Uint8Array(entry.size);
      let offset = 0;
      for await (const c of dataGen) {
        if (offset + c.byteLength > entry.size) {
          // Malformed archive: chunk would write past the declared entry size.
          // Truncate at entry.size to avoid out-of-bounds writes and throw so
          // callers know the data is corrupt. Code matches the TAR_PARSER_INVARIANT
          // convention used in parseTar (corrupt archive detected at parse level).
          throw Object.assign(
            new Error(
              `tar: entry "${entry.name}" declared size ${entry.size} but received more bytes (offset ${offset} + chunk ${c.byteLength} = ${offset + c.byteLength})`
            ),
            { code: 'TAR_PARSER_INVARIANT' }
          );
        }
        buf.set(c, offset);
        offset += c.byteLength;
      }
      cachedBytes = buf;
      return cachedBytes;
    },
    async text(encoding?: string): Promise<string> {
      const raw = await this.bytes();
      return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString(
        (encoding ?? 'utf8') as BufferEncoding
      );
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
        // Stray chunk at outer-loop level is a parser invariant violation (D-5).
        const err = new Error('parser invariant: chunk emitted before entry');
        (err as Error & { code: string }).code = 'TAR_PARSER_INVARIANT';
        throw err;
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
      let dataGenInFlight = false;
      function makeDataGen(): AsyncGenerator<Uint8Array> {
        if (dataGenInFlight) {
          throw new Error('concurrent entry.data iteration is not supported');
        }
        dataGenInFlight = true;
        return (async function* () {
          try {
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
          } finally {
            dataGenInFlight = false;
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
