/**
 * Node.js TAR listing with XZ decompression — v6 AsyncIterable API
 */

import { Readable, Writable } from 'node:stream';
import { createUnxz } from 'node-liblzma';
import { calculatePadding } from '../tar/index.js';
import { toAsyncIterable, type TarInputNode } from '../internal/to-async-iterable.js';
import type { TarEntry } from '../types.js';
import { type HeaderParserState, parseNextHeader } from './tar-parser.js';

// ---------------------------------------------------------------------------
// Internal helpers (mirrors node/extract.ts — kept local to avoid circular dep)
// ---------------------------------------------------------------------------

async function collectAllChunks(input: TarInputNode): Promise<Uint8Array> {
  const iterable = toAsyncIterable(input);
  const chunks: Uint8Array[] = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function decompressXz(data: Uint8Array): Promise<Uint8Array> {
  const unxzStream = createUnxz();
  const readable = Readable.from(
    (async function* () {
      yield data;
    })()
  );

  const output: Uint8Array[] = [];
  let resolveFlush!: () => void;
  let rejectFlush!: (e: unknown) => void;
  const done = new Promise<void>((res, rej) => {
    resolveFlush = res;
    rejectFlush = rej;
  });

  unxzStream.on('data', (...args: unknown[]) => {
    const chunk = args[0] as Buffer;
    output.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  });
  unxzStream.on('end', resolveFlush);
  unxzStream.on('error', rejectFlush);
  readable.pipe(unxzStream);

  await done;

  const total = output.reduce((n, c) => n + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of output) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function runWritable(writable: Writable, data: Uint8Array): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    writable.on('finish', resolve);
    writable.on('error', reject);
    writable.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    writable.end();
  });
}

/**
 * Writable stream that lists TAR entries without extracting content
 */
class TarList extends Writable {
  private readonly state: HeaderParserState = {
    buffer: Buffer.alloc(0),
    paxAttrs: null,
    emptyBlockCount: 0,
  };
  private bytesToSkip = 0;

  public entries: TarEntry[] = [];

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.state.buffer = Buffer.concat([this.state.buffer, chunk]);

    try {
      this.processBuffer();
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  /** Skip content and padding bytes for the current entry. */
  private skipBytes(): boolean {
    if (this.bytesToSkip <= 0) {
      return false;
    }
    const skip = Math.min(this.bytesToSkip, this.state.buffer.length);
    this.state.buffer = this.state.buffer.subarray(skip);
    this.bytesToSkip -= skip;
    return true;
  }

  /** Record entry and schedule content skip. */
  private handleEntry(entry: TarEntry): void {
    this.entries.push(entry);
    if (entry.size > 0) {
      this.bytesToSkip = entry.size + calculatePadding(entry.size);
    }
  }

  private processBuffer(): void {
    while (this.state.buffer.length > 0) {
      if (this.skipBytes()) continue;

      const result = parseNextHeader(this.state);
      if (result.action === 'need-more-data' || result.action === 'end-of-archive') break;
      if (result.action === 'pax-consumed') continue;
      this.handleEntry(result.entry);
    }
  }

  _final(callback: (error?: Error | null) => void): void {
    callback();
  }
}

/**
 * List the contents of a tar.xz archive.
 *
 * Returns an `AsyncIterable<TarEntry>` yielding each entry's metadata.
 * Entry content is skipped — use `extract()` if you need the data.
 *
 * @example
 * ```ts
 * for await (const entry of list(input)) {
 *   console.log(entry.name, entry.size);
 * }
 * ```
 */
export async function* list(input: TarInputNode): AsyncIterable<TarEntry> {
  const chunks = await collectAllChunks(input);
  const tarData = await decompressXz(chunks);

  const tarList = new TarList();
  await runWritable(tarList, tarData);

  for (const entry of tarList.entries) {
    yield entry;
  }
}
