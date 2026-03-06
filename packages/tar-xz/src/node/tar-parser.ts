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
  /* v8 ignore start - streaming edge case: chunk boundary splits a 512-byte block */
  if (state.buffer.length < BLOCK_SIZE) {
    return { action: 'need-more-data' };
  }
  /* v8 ignore stop */

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
  /* v8 ignore start - dead code: empty blocks filtered above, parseHeader only returns null for empty */
  if (!raw) {
    return { action: 'pax-consumed' };
  }
  /* v8 ignore stop */

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

  /* v8 ignore start - streaming edge case: PAX data split across XZ chunks */
  if (state.buffer.length < totalNeeded) {
    // Put the header block back — we'll retry when more data arrives
    state.buffer = Buffer.concat([headerBlock, state.buffer]);
    return { action: 'need-more-data' };
  }
  /* v8 ignore stop */

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

  /* v8 ignore start - streaming edge case: global PAX data split across XZ chunks */
  if (state.buffer.length < skipSize) {
    state.buffer = Buffer.concat([headerBlock, state.buffer]);
    return { action: 'need-more-data' };
  }
  /* v8 ignore stop */

  state.buffer = state.buffer.subarray(skipSize);
  return { action: 'pax-consumed' };
}
