/**
 * Block 4 Tests — Streaming API (Web TransformStream)
 * Tests: SC-04, SC-05
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUnxz, createXz } from '../../src/wasm/stream.js';
import { loadWasmModule, unloadWasmModule } from './wasm-helpers.utils.js';

/** Collect all chunks from a ReadableStream into a single Uint8Array */
async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/** Create a ReadableStream from a Uint8Array, optionally splitting into chunks */
function createInputStream(data: Uint8Array, chunkSize?: number): ReadableStream<Uint8Array> {
  const size = chunkSize ?? data.byteLength;
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= data.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(offset + size, data.byteLength);
      controller.enqueue(data.slice(offset, end));
      offset = end;
    },
  });
}

describe('WASM Streaming (Block 4)', () => {
  beforeAll(async () => {
    await loadWasmModule();
  });

  afterAll(() => {
    unloadWasmModule();
  });

  describe('createXz', () => {
    it('SC-04: should compress a stream to valid XZ', async () => {
      const input = new TextEncoder().encode('Streaming compression test');
      const inputStream = createInputStream(input);
      const compressed = await collectStream(inputStream.pipeThrough(createXz()));

      // Verify XZ magic
      expect(compressed[0]).toBe(0xfd);
      expect(compressed[1]).toBe(0x37);
      // Verify XZ footer
      expect(compressed[compressed.byteLength - 2]).toBe(0x59);
      expect(compressed[compressed.byteLength - 1]).toBe(0x5a);
    });

    it('should compress with custom preset', async () => {
      const input = new TextEncoder().encode('Custom preset stream');
      const inputStream = createInputStream(input);
      const compressed = await collectStream(inputStream.pipeThrough(createXz({ preset: 1 })));
      expect(compressed[0]).toBe(0xfd);
    });
  });

  describe('createUnxz', () => {
    it('SC-05: should decompress a stream', async () => {
      const original = new TextEncoder().encode('Stream decompression test');

      // First compress
      const compressedStream = createInputStream(original).pipeThrough(createXz());
      const compressed = await collectStream(compressedStream);

      // Then decompress
      const decompressedStream = createInputStream(compressed).pipeThrough(createUnxz());
      const decompressed = await collectStream(decompressedStream);

      expect(decompressed).toEqual(original);
    });
  });

  describe('Error handling', () => {
    it('should error on completely invalid data in decompression stream', async () => {
      // Feed random garbage that isn't valid XZ at all
      const garbage = new Uint8Array(1024);
      for (let i = 0; i < garbage.length; i++) garbage[i] = (i * 7 + 13) % 256;

      const decompressStream = createInputStream(garbage).pipeThrough(createUnxz());
      await expect(collectStream(decompressStream)).rejects.toThrow();
    });
  });

  describe('Chunked streaming', () => {
    it('should handle data split into small chunks', async () => {
      const original = new TextEncoder().encode('A'.repeat(50000));

      // Compress in 1KB chunks
      const compressedStream = createInputStream(original, 1024).pipeThrough(createXz());
      const compressed = await collectStream(compressedStream);
      expect(compressed[0]).toBe(0xfd);

      // Decompress in 512-byte chunks
      const decompressedStream = createInputStream(compressed, 512).pipeThrough(createUnxz());
      const decompressed = await collectStream(decompressedStream);
      expect(decompressed).toEqual(original);
    });

    it('should handle single-byte chunks', async () => {
      const original = new TextEncoder().encode('Small chunk test');

      // Compress byte by byte
      const compressedStream = createInputStream(original, 1).pipeThrough(createXz());
      const compressed = await collectStream(compressedStream);

      // Decompress normally
      const decompressedStream = createInputStream(compressed).pipeThrough(createUnxz());
      const decompressed = await collectStream(decompressedStream);
      expect(decompressed).toEqual(original);
    });
  });
});
