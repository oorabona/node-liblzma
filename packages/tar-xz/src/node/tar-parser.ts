/**
 * Shared TAR header parsing helpers for extract and list streams.
 *
 * Both TarUnpack (extract) and TarList (list) share the same header-parsing
 * state machine: read 512-byte blocks, detect end-of-archive, parse headers,
 * consume PAX / PAX_GLOBAL extensions, and apply PAX attributes. The only
 * difference is what they do with the resulting entry (extract content vs skip).
 *
 * These helpers keep that shared logic in one place while letting each stream
 * own its own entry-processing strategy.
 */

import {
  applyPaxAttributes,
  BLOCK_SIZE,
  calculatePadding,
  isEmptyBlock,
  parseHeader,
  parsePaxData,
} from '../tar/index.js';
import type { PaxAttributes } from '../tar/pax.js';
import { type TarEntry, TarEntryType } from '../types.js';

// ---------------------------------------------------------------------------
// Shared parser state — every stream that parses TAR headers carries this
// ---------------------------------------------------------------------------

/** Mutable state shared by the header-parsing helpers. */
export interface HeaderParserState {
  buffer: Buffer;
  paxAttrs: PaxAttributes | null;
  emptyBlockCount: number;
}

// ---------------------------------------------------------------------------
// Parse result discriminated union
// ---------------------------------------------------------------------------

/** The buffer didn't contain a full 512-byte block yet. */
export interface NeedMoreData {
  readonly action: 'need-more-data';
}

/** Two consecutive empty blocks — end of archive. */
export interface EndOfArchive {
  readonly action: 'end-of-archive';
}

/** A PAX or global-PAX header was consumed (caller should `continue`). */
export interface PaxConsumed {
  readonly action: 'pax-consumed';
}

/**
 * A real entry (file / directory / symlink / …) was parsed, with PAX
 * attributes already applied.
 */
export interface EntryParsed {
  readonly action: 'entry';
  readonly entry: TarEntry;
}

export type HeaderParseResult = NeedMoreData | EndOfArchive | PaxConsumed | EntryParsed;

// ---------------------------------------------------------------------------
// Core helper
// ---------------------------------------------------------------------------

/**
 * Try to parse the next TAR header from `state.buffer`.
 *
 * On success the buffer is advanced past the consumed block(s).
 * The caller loops until it gets `need-more-data` or `end-of-archive`.
 *
 * Handles:
 * - incomplete block detection
 * - end-of-archive (two empty blocks)
 * - header parsing
 * - PAX_HEADER consumption (reads data blocks, updates `paxAttrs`)
 * - PAX_GLOBAL consumption (skips data blocks)
 * - applying accumulated PAX attributes to the entry
 */
export function parseNextHeader(state: HeaderParserState): HeaderParseResult {
  // Need a full block for the header
  if (state.buffer.length < BLOCK_SIZE) {
    return { action: 'need-more-data' };
  }

  const headerBlock = state.buffer.subarray(0, BLOCK_SIZE);

  // End-of-archive detection (two consecutive empty blocks)
  if (isEmptyBlock(headerBlock)) {
    state.buffer = state.buffer.subarray(BLOCK_SIZE);
    state.emptyBlockCount++;
    if (state.emptyBlockCount >= 2) {
      return { action: 'end-of-archive' };
    }
    return { action: 'pax-consumed' }; // empty block consumed, keep looping
  }

  // Consume the header block
  state.buffer = state.buffer.subarray(BLOCK_SIZE);
  state.emptyBlockCount = 0;

  // Parse header
  const raw = parseHeader(headerBlock);
  if (!raw) {
    return { action: 'pax-consumed' };
  }

  // PAX extended header — read data blocks and store attributes
  if (raw.type === TarEntryType.PAX_HEADER) {
    return consumePaxHeader(state, headerBlock, raw);
  }

  // PAX global header — skip data blocks
  if (raw.type === TarEntryType.PAX_GLOBAL) {
    return consumePaxGlobal(state, headerBlock, raw);
  }

  // Regular entry — apply pending PAX attributes
  let entry = raw;
  if (state.paxAttrs) {
    entry = applyPaxAttributes(entry, state.paxAttrs);
    state.paxAttrs = null;
  }

  return { action: 'entry', entry };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function consumePaxHeader(
  state: HeaderParserState,
  headerBlock: Buffer,
  entry: TarEntry
): HeaderParseResult {
  const paxSize = entry.size;
  const paxPadding = calculatePadding(paxSize);
  const totalNeeded = paxSize + paxPadding;

  if (state.buffer.length < totalNeeded) {
    // Put the header block back — we'll retry when more data arrives
    state.buffer = Buffer.concat([headerBlock, state.buffer]);
    return { action: 'need-more-data' };
  }

  const paxData = state.buffer.subarray(0, paxSize);
  state.buffer = state.buffer.subarray(paxSize + paxPadding);
  state.paxAttrs = parsePaxData(paxData);
  return { action: 'pax-consumed' };
}

function consumePaxGlobal(
  state: HeaderParserState,
  headerBlock: Buffer,
  entry: TarEntry
): HeaderParseResult {
  const skipSize = entry.size + calculatePadding(entry.size);

  if (state.buffer.length < skipSize) {
    state.buffer = Buffer.concat([headerBlock, state.buffer]);
    return { action: 'need-more-data' };
  }

  state.buffer = state.buffer.subarray(skipSize);
  return { action: 'pax-consumed' };
}

// ---------------------------------------------------------------------------
// Streaming parser
// ---------------------------------------------------------------------------

/** Maximum PAX header payload size (DoS guard — A-07/A-08). */
const MAX_PAX_HEADER_BYTES = 1024 * 1024; // 1 MB

/**
 * Discriminated union emitted by {@link parseTar}.
 *
 * - `entry` — a new TAR entry header was parsed
 * - `chunk` — raw content bytes for the current entry (only in `'extract'` mode)
 * - `end`   — end-of-archive sentinel (two consecutive empty blocks consumed)
 */
export type ParseEvent =
  | { kind: 'entry'; entry: TarEntry }
  | { kind: 'chunk'; data: Uint8Array }
  | { kind: 'end' };

/**
 * Streaming TAR parser generator.
 *
 * Processes decompressed TAR bytes arriving as `Uint8Array` chunks from
 * `source` (typically the output of {@link streamXz}) without holding the
 * full archive in memory.
 *
 * In `'extract'` mode the generator emits `kind:'entry'` followed by zero or
 * more `kind:'chunk'` events containing the raw entry content, then moves to
 * the next entry.
 *
 * In `'list'` mode the generator emits only `kind:'entry'` events; content
 * bytes are consumed internally without being yielded.
 *
 * The generator ALWAYS emits a final `kind:'end'` event before returning.
 * If the stream ends before the end-of-archive marker is seen, an `Error` with
 * message `"Unexpected end of archive"` is thrown.
 *
 * @param source - Decompressed TAR byte stream (single-use).
 * @param mode   - `'extract'` yields content chunks; `'list'` skips them.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: streaming state machine — inherently complex; subdividing would break the phase-transition flow
export async function* parseTar(
  source: AsyncIterable<Uint8Array>,
  mode: 'extract' | 'list'
): AsyncGenerator<ParseEvent> {
  const state: HeaderParserState = {
    buffer: Buffer.alloc(0),
    paxAttrs: null,
    emptyBlockCount: 0,
  };

  // HEADER | CONTENT | SKIP | PADDING
  type Phase = 'HEADER' | 'CONTENT' | 'SKIP' | 'PADDING';
  let phase: Phase = 'HEADER';
  let bytesRemaining = 0;
  let paddingRemaining = 0;

  /** Pull next chunk from source and append to state.buffer. */
  const iter = source[Symbol.asyncIterator]();

  async function pullChunk(): Promise<boolean> {
    const { value, done } = await iter.next();
    if (done) return false;
    const chunk = value as Uint8Array;
    if (state.buffer.length + chunk.length > MAX_PAX_HEADER_BYTES && phase === 'HEADER') {
      const err = new Error(`PAX header exceeds maximum size (${MAX_PAX_HEADER_BYTES / 1024} KB)`);
      (err as Error & { code: string }).code = 'TAR_PARSER_INVARIANT';
      throw err;
    }
    state.buffer = Buffer.concat([state.buffer, Buffer.from(chunk)]);
    return true;
  }

  try {
    while (true) {
      if (phase === 'HEADER') {
        // Pull at least one chunk initially so the buffer has data.
        if (state.buffer.length === 0) {
          const got = await pullChunk();
          if (!got) {
            throw new Error('Unexpected end of archive');
          }
        }

        // Try to parse headers; pull more data when needed.
        while (true) {
          const result = parseNextHeader(state);

          if (result.action === 'need-more-data') {
            const got = await pullChunk();
            if (!got) {
              throw new Error('Unexpected end of archive');
            }
            continue;
          }

          if (result.action === 'end-of-archive') {
            yield { kind: 'end' };
            return;
          }

          if (result.action === 'pax-consumed') {
            continue;
          }

          // action === 'entry'
          const entry = result.entry;
          yield { kind: 'entry', entry };

          if (mode === 'list' || entry.size === 0) {
            // For list mode or empty entries, skip content + padding together.
            if (entry.size > 0) {
              bytesRemaining = entry.size + calculatePadding(entry.size);
              phase = 'SKIP';
            } else {
              phase = 'HEADER';
            }
          } else {
            // Extract mode with content.
            bytesRemaining = entry.size;
            paddingRemaining = calculatePadding(entry.size);
            phase = 'CONTENT';
          }
          break;
        }

        continue;
      }

      if (phase === 'CONTENT') {
        // Yield content bytes, splitting at entry boundary.
        if (bytesRemaining === 0) {
          phase = 'PADDING';
          continue;
        }

        if (state.buffer.length === 0) {
          const got = await pullChunk();
          if (!got) {
            throw new Error('Unexpected end of archive');
          }
        }

        const take = Math.min(bytesRemaining, state.buffer.length);
        const chunk = state.buffer.subarray(0, take);
        state.buffer = state.buffer.subarray(take);
        bytesRemaining -= take;
        yield {
          kind: 'chunk',
          data: new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
        };
        continue;
      }

      if (phase === 'SKIP') {
        // Silently consume skip bytes (list mode or zero-size entries).
        if (bytesRemaining === 0) {
          phase = 'HEADER';
          continue;
        }

        if (state.buffer.length === 0) {
          const got = await pullChunk();
          if (!got) {
            throw new Error('Unexpected end of archive');
          }
        }

        const skip = Math.min(bytesRemaining, state.buffer.length);
        state.buffer = state.buffer.subarray(skip);
        bytesRemaining -= skip;
        continue;
      }

      if (phase === 'PADDING') {
        // Silently consume padding bytes.
        if (paddingRemaining === 0) {
          phase = 'HEADER';
          continue;
        }

        if (state.buffer.length === 0) {
          const got = await pullChunk();
          if (!got) {
            // Padding missing at end-of-stream is tolerable if we already know
            // the archive ended (previous end-of-archive detection covers the
            // normal case). If we're here the EOA hasn't been seen yet — throw.
            throw new Error('Unexpected end of archive');
          }
        }

        const skip = Math.min(paddingRemaining, state.buffer.length);
        state.buffer = state.buffer.subarray(skip);
        paddingRemaining -= skip;
        continue;
      }

      // Unreachable — all phases handled above.
      /* v8 ignore next */
      break;
    }
  } finally {
    // If the consumer called generator.return() early, propagate cleanup to the
    // source iterator so upstream (streamXz) can destroy its pipeline.
    await iter.return?.();
  }
}
