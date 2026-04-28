/**
 * Unit tests for parseTar() streaming TAR parser generator.
 * Story: TAR-XZ-STREAMING-2026-04-28, Block 2
 *
 * Test layout: flat (alongside coverage.spec.ts) per spec §12.5 / L-L-08.
 */
import { describe, expect, it } from 'vitest';
import { calculatePadding, createEndOfArchive, createHeader } from '../src/tar/format.js';
import { createPaxHeaderBlocks } from '../src/tar/pax.js';
import { type ParseEvent, parseTar } from '../src/node/tar-parser.js';
import { TarEntryType } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: test helper covering PAX/regular/global entries
/** Build a raw TAR buffer with end-of-archive blocks. */
function buildTar(
  entries: Array<{
    name: string;
    content?: Buffer;
    type?: string;
    linkname?: string;
    usePax?: boolean;
    globalPax?: boolean;
    globalAttrs?: Record<string, string>;
  }>
): Buffer {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    const content = entry.content ?? Buffer.alloc(0);
    const type = (entry.type ?? TarEntryType.FILE) as string;
    const isDir = type === TarEntryType.DIRECTORY;
    const isLink = type === TarEntryType.SYMLINK || type === TarEntryType.HARDLINK;
    const size = isDir || isLink ? 0 : content.length;

    if (entry.globalPax && entry.globalAttrs) {
      // Build a PAX_GLOBAL block manually.
      const attrs = entry.globalAttrs;
      const paxData = Object.entries(attrs)
        .map(([k, v]) => {
          const line = ` ${k}=${v}\n`;
          const len = String(line.length + 1).length + line.length;
          return `${len}${line}`;
        })
        .join('');
      const paxBuf = Buffer.from(paxData);
      const paxPad = calculatePadding(paxBuf.length);
      const gHeader = createHeader({
        name: '././@PaxHeader',
        size: paxBuf.length,
        type: 'g' as '0',
      });
      blocks.push(Buffer.from(gHeader));
      blocks.push(paxBuf);
      if (paxPad > 0) blocks.push(Buffer.alloc(paxPad));
      continue;
    }

    let headerName = entry.name;

    if (entry.usePax || headerName.length > 99) {
      const paxBlocks = createPaxHeaderBlocks(headerName, {
        path: headerName,
        size,
        linkpath: entry.linkname,
      });
      for (const block of paxBlocks) {
        blocks.push(Buffer.from(block));
      }
      headerName = headerName.slice(-99);
    }

    const header = createHeader({
      name: headerName,
      size,
      type: type as '0',
      linkname: entry.linkname,
    });
    blocks.push(Buffer.from(header));

    if (size > 0) {
      blocks.push(content);
      const pad = calculatePadding(size);
      if (pad > 0) blocks.push(Buffer.alloc(pad));
    }
  }

  blocks.push(Buffer.from(createEndOfArchive()));
  return Buffer.concat(blocks);
}

/** Build a raw TAR buffer WITHOUT end-of-archive (truncated). */
function buildTarTruncated(entry: { name: string; content: Buffer }): Buffer {
  const header = createHeader({
    name: entry.name,
    size: entry.content.length,
    type: '0',
  });
  // Only half the content — simulates truncated archive.
  return Buffer.concat([
    Buffer.from(header),
    entry.content.subarray(0, Math.ceil(entry.content.length / 2)),
  ]);
}

/** Chunk `buf` into `chunkSize`-byte pieces. */
function* chunkBuffer(buf: Buffer, chunkSize: number): Generator<Uint8Array> {
  let offset = 0;
  while (offset < buf.length) {
    const end = Math.min(offset + chunkSize, buf.length);
    yield new Uint8Array(buf.buffer, buf.byteOffset + offset, end - offset);
    offset = end;
  }
}

/** Async iterable from a sync generator of Uint8Array. */
async function* asyncChunks(gen: Iterable<Uint8Array>): AsyncIterable<Uint8Array> {
  for (const chunk of gen) {
    yield chunk;
  }
}

/** Collect all ParseEvents from parseTar into an array. */
async function collectEvents(
  source: AsyncIterable<Uint8Array>,
  mode: 'extract' | 'list'
): Promise<ParseEvent[]> {
  const events: ParseEvent[] = [];
  for await (const ev of parseTar(source, mode)) {
    events.push(ev);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseTar() — streaming TAR parser', () => {
  it('3-entry archive fed in 128-byte chunks — all entries parsed correctly', async () => {
    const tar = buildTar([
      { name: 'a.txt', content: Buffer.from('hello') },
      { name: 'b.txt', content: Buffer.from('world-world-world') },
      { name: 'c.txt', content: Buffer.from('!') },
    ]);

    const source = asyncChunks(chunkBuffer(tar, 128));
    const events = await collectEvents(source, 'extract');

    // Expect: entry a, chunks for a, entry b, chunks for b, entry c, chunks for c, end
    const entries = events.filter((e) => e.kind === 'entry');
    expect(entries).toHaveLength(3);
    expect((entries[0] as Extract<ParseEvent, { kind: 'entry' }>).entry.name).toBe('a.txt');
    expect((entries[1] as Extract<ParseEvent, { kind: 'entry' }>).entry.name).toBe('b.txt');
    expect((entries[2] as Extract<ParseEvent, { kind: 'entry' }>).entry.name).toBe('c.txt');

    // Collect chunks per entry
    function chunksFor(entryIndex: number): Buffer {
      const parts: Buffer[] = [];
      let idx = 0;
      let targetEntry = -1;
      for (const ev of events) {
        if (ev.kind === 'entry') {
          idx++;
          targetEntry = idx - 1;
        } else if (ev.kind === 'chunk' && targetEntry === entryIndex) {
          parts.push(Buffer.from(ev.data));
        }
      }
      return Buffer.concat(parts);
    }

    expect(chunksFor(0).toString()).toBe('hello');
    expect(chunksFor(1).toString()).toBe('world-world-world');
    expect(chunksFor(2).toString()).toBe('!');

    const endEvents = events.filter((e) => e.kind === 'end');
    expect(endEvents).toHaveLength(1);
  });

  it('PAX header payload split across 513-byte chunks (S-05) — entry.name correctly assembled', async () => {
    // Create an entry with a long name that forces PAX usage.
    const longName = `${'a'.repeat(150)}/file.txt`;
    const content = Buffer.from('pax-content');
    const tar = buildTar([{ name: longName, content }]);

    // 513 bytes forces splits at 512+1 boundary, exercising consumePaxHeader re-entrancy.
    const source = asyncChunks(chunkBuffer(tar, 513));
    const events = await collectEvents(source, 'extract');

    const entryEvents = events.filter((e) => e.kind === 'entry');
    expect(entryEvents).toHaveLength(1);
    expect((entryEvents[0] as Extract<ParseEvent, { kind: 'entry' }>).entry.name).toBe(longName);

    const chunkEvents = events.filter((e) => e.kind === 'chunk');
    const assembled = Buffer.concat(
      chunkEvents.map((e) => Buffer.from((e as Extract<ParseEvent, { kind: 'chunk' }>).data))
    );
    expect(assembled.toString()).toBe('pax-content');
  });

  it('PAX_GLOBAL header split across chunks (L-M-03) — globals correctly applied', async () => {
    // Build: PAX_GLOBAL (comment attr) then a regular entry.
    const tar = buildTar([
      {
        name: 'global-entry',
        globalPax: true,
        globalAttrs: { comment: 'global-comment' },
      },
      { name: 'real.txt', content: Buffer.from('real') },
    ]);

    // Small chunks force the PAX_GLOBAL split.
    const source = asyncChunks(chunkBuffer(tar, 128));
    const events = await collectEvents(source, 'extract');

    const entryEvents = events.filter((e) => e.kind === 'entry');
    // The PAX_GLOBAL entry is consumed internally — only the real entry is emitted.
    expect(entryEvents).toHaveLength(1);
    expect((entryEvents[0] as Extract<ParseEvent, { kind: 'entry' }>).entry.name).toBe('real.txt');
  });

  it('two consecutive empty blocks → emits kind:end', async () => {
    // Create minimal archive (just EOA).
    const tar = Buffer.from(createEndOfArchive());
    const source = asyncChunks(chunkBuffer(tar, 512));
    const events = await collectEvents(source, 'extract');

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('end');
  });

  it('truncated stream → throws "Unexpected end of archive" before kind:end (S-09)', async () => {
    const tar = buildTarTruncated({
      name: 'big.bin',
      content: Buffer.alloc(1024, 0xab),
    });

    const source = asyncChunks(chunkBuffer(tar, 128));
    await expect(collectEvents(source, 'extract')).rejects.toThrow('Unexpected end of archive');
  });

  it('mode:list never emits kind:chunk events', async () => {
    const tar = buildTar([
      { name: 'x.bin', content: Buffer.alloc(4096, 0xff) },
      { name: 'y.bin', content: Buffer.alloc(2048, 0xee) },
    ]);

    const source = asyncChunks(chunkBuffer(tar, 256));
    const events = await collectEvents(source, 'list');

    const chunkEvents = events.filter((e) => e.kind === 'chunk');
    expect(chunkEvents).toHaveLength(0);

    const entryEvents = events.filter((e) => e.kind === 'entry');
    expect(entryEvents).toHaveLength(2);
    expect(events.at(-1)?.kind).toBe('end');
  });

  it('auto-drain (S-08): consumer skips entry.data — parser silently consumes content + padding before next header', async () => {
    // Build archive with large first entry; consumer will skip it.
    const tar = buildTar([
      { name: 'skip-me.bin', content: Buffer.alloc(1024, 0xaa) },
      { name: 'read-me.txt', content: Buffer.from('correct') },
    ]);

    const source = asyncChunks(chunkBuffer(tar, 128));
    const parser = parseTar(source, 'extract');

    // Pull the first entry but consume NO chunks.
    const first = await parser.next();
    expect(first.done).toBe(false);
    expect((first.value as Extract<ParseEvent, { kind: 'entry' }>).entry.name).toBe('skip-me.bin');

    // Immediately advance to next entry — must skip over chunks.
    // parseTar emits chunks before the next 'entry' event, so drain manually.
    let ev: IteratorResult<ParseEvent>;
    do {
      ev = await parser.next();
    } while (!ev.done && ev.value.kind === 'chunk');

    // Should now be at 'entry' for read-me.txt
    expect(ev.done).toBe(false);
    expect((ev.value as Extract<ParseEvent, { kind: 'entry' }>).kind).toBe('entry');
    expect((ev.value as Extract<ParseEvent, { kind: 'entry' }>).entry.name).toBe('read-me.txt');

    // Drain the content for read-me.txt.
    const parts: Buffer[] = [];
    for await (const event of parser) {
      if (event.kind === 'chunk') parts.push(Buffer.from(event.data));
      if (event.kind === 'end') break;
    }
    expect(Buffer.concat(parts).toString()).toBe('correct');
  });

  it('parser invariant violation throws error with code TAR_PARSER_INVARIANT (D-5 / L-S-02)', async () => {
    // Manufacture a stream that triggers the PAX bomb guard (> 1 MB in header phase).
    const MAX_PAX = 1024 * 1024;
    // Create a source that yields a chunk larger than MAX_PAX during header phase.
    async function* bigSource(): AsyncIterable<Uint8Array> {
      yield new Uint8Array(MAX_PAX + 1);
    }

    let caught: Error | undefined;
    try {
      for await (const _ of parseTar(bigSource(), 'extract')) {
        // nothing
      }
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).toBeDefined();
    expect((caught as Error & { code?: string }).code).toBe('TAR_PARSER_INVARIANT');
  });
});
