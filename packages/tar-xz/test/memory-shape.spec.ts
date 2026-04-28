/**
 * Memory shape CI gate — Block 5 (TAR-XZ-STREAMING-2026-04-28)
 *
 * Validates that the streaming extract() / list() implementation is O(largest entry)
 * rather than O(archive), using in-loop high-water-mark sampling (§12.3).
 *
 * Test runner requirements:
 *  - vitest pool: 'forks' with execArgv: ['--expose-gc'] (vitest.config.ts)
 *  - These tests feature-detect `globalThis.gc` at runtime; they SKIP (not fail)
 *    when --expose-gc is absent, so CI remains green without the flag.
 *
 * Thresholds (per §12.3):
 *  - extract: peak delta ≤ 2 × largestEntrySize + 16 MB
 *    (16 MB slack covers XZ preset-6 ~8 MB dictionary + parser carry-over + GC jitter)
 *  - list:    peak delta ≤ 16 MB regardless of total archive size
 *    (list never holds entry data — O(BLOCK_SIZE) memory)
 */

import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { create, extract, list } from '../src/node/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** High-water mark sampler. Call on every chunk boundary inside the test loop. */
function makeSampler(): { sample: () => void; peak: () => number; baseline: number } {
  const m = process.memoryUsage();
  const baseline = m.heapUsed + m.external;
  let high = baseline;

  return {
    baseline,
    sample() {
      const mu = process.memoryUsage();
      const total = mu.heapUsed + mu.external;
      if (total > high) high = total;
    },
    peak() {
      return high;
    },
  };
}

/**
 * Build an in-memory .tar.xz archive from a list of { name, size } entries.
 * Each file is filled with a repeated byte pattern (compressible).
 * Returns a Uint8Array of the compressed archive.
 */
async function buildArchive(
  files: Array<{ name: string; size: number; byte?: number }>,
  preset = 1
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of create({
    files: files.map((f) => ({
      name: f.name,
      source: Buffer.alloc(f.size, f.byte ?? 0xab),
    })),
    preset, // Default fast preset; callers may pass 6 when testing preset-6 dictionary slack
  })) {
    chunks.push(chunk);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

// Feature-detect --expose-gc (provided by vitest forks pool config)
const hasGc = typeof (globalThis as unknown as { gc?: () => void }).gc === 'function';
const gc = hasGc ? (globalThis as unknown as { gc: () => void }).gc : null;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Memory shape gate (requires --expose-gc; skips otherwise)', () => {
  // -------------------------------------------------------------------------
  // Test 1: extract() with a single 50 MB entry
  // -------------------------------------------------------------------------

  it.runIf(hasGc)(
    'extract memory shape — single 50 MB entry — peak delta ≤ 2× entry + 16 MB slack',
    async () => {
      const ENTRY_SIZE = 50 * 1024 * 1024; // 50 MB
      const THRESHOLD = 2 * ENTRY_SIZE + 16 * 1024 * 1024; // 116 MB

      // preset: 6 matches the 16 MB slack rationale (XZ preset-6 dictionary ≈ 8 MB)
      const archive = await buildArchive([{ name: 'big.bin', size: ENTRY_SIZE }], 6);

      gc!();
      const sampler = makeSampler();

      for await (const entry of extract(Readable.from([archive]))) {
        sampler.sample();
        for await (const _ of entry.data) {
          sampler.sample();
        }
        sampler.sample();
      }

      gc!();
      sampler.sample();

      const delta = sampler.peak() - sampler.baseline;

      // eslint-disable-next-line no-console
      console.log(
        `[memory-shape] extract single-entry: delta=${(delta / 1024 / 1024).toFixed(1)} MB, ` +
          `threshold=${(THRESHOLD / 1024 / 1024).toFixed(0)} MB`
      );

      expect(delta).toBeLessThan(THRESHOLD);
    },
    // 60-second timeout for large archive build + extract
    60_000
  );

  // -------------------------------------------------------------------------
  // Test 2: list() with 100 entries — peak bounded regardless of total size
  // -------------------------------------------------------------------------

  it.runIf(hasGc)(
    'list memory shape — 100 × 1 MB entries — peak delta ≤ 16 MB',
    async () => {
      // 100 entries × 1 MB = 100 MB total decompressed size
      // list() should hold O(BLOCK_SIZE) — no content bytes, only header metadata
      const ENTRY_COUNT = 100;
      const ENTRY_SIZE = 1 * 1024 * 1024; // 1 MB each
      const THRESHOLD = 16 * 1024 * 1024; // 16 MB

      const archive = await buildArchive(
        Array.from({ length: ENTRY_COUNT }, (_, i) => ({
          name: `file-${i.toString().padStart(3, '0')}.bin`,
          size: ENTRY_SIZE,
        }))
      );

      gc!();
      const sampler = makeSampler();

      let count = 0;
      for await (const entry of list(Readable.from([archive]))) {
        sampler.sample();
        count++;
        expect(typeof entry.name).toBe('string');
        expect(entry.size).toBe(ENTRY_SIZE);
      }

      gc!();
      sampler.sample();

      expect(count).toBe(ENTRY_COUNT);

      const delta = sampler.peak() - sampler.baseline;

      // eslint-disable-next-line no-console
      console.log(
        `[memory-shape] list 100×1MB: delta=${(delta / 1024 / 1024).toFixed(1)} MB, ` +
          `threshold=${(THRESHOLD / 1024 / 1024).toFixed(0)} MB`
      );

      expect(delta).toBeLessThan(THRESHOLD);
    },
    90_000
  );

  // -------------------------------------------------------------------------
  // Test 3: extract() with 5 × 10 MB entries — peak bounded to largest entry
  // -------------------------------------------------------------------------

  it.runIf(hasGc)(
    'extract memory shape — 5 × 10 MB entries — peak delta ≤ 2× largest + 16 MB slack',
    async () => {
      const ENTRY_COUNT = 5;
      const LARGEST_ENTRY = 10 * 1024 * 1024; // 10 MB
      const THRESHOLD = 2 * LARGEST_ENTRY + 16 * 1024 * 1024; // 36 MB

      const archive = await buildArchive(
        Array.from({ length: ENTRY_COUNT }, (_, i) => ({
          name: `chunk-${i}.bin`,
          size: LARGEST_ENTRY,
          byte: i * 17, // different byte per entry so XZ can't trivially dedupe
        }))
      );

      gc!();
      const sampler = makeSampler();

      let totalBytes = 0;
      for await (const entry of extract(Readable.from([archive]))) {
        sampler.sample();
        for await (const chunk of entry.data) {
          sampler.sample();
          totalBytes += chunk.length;
        }
        sampler.sample();
      }

      gc!();
      sampler.sample();

      expect(totalBytes).toBe(ENTRY_COUNT * LARGEST_ENTRY);

      const delta = sampler.peak() - sampler.baseline;

      // eslint-disable-next-line no-console
      console.log(
        `[memory-shape] extract 5×10MB: delta=${(delta / 1024 / 1024).toFixed(1)} MB, ` +
          `threshold=${(THRESHOLD / 1024 / 1024).toFixed(0)} MB`
      );

      expect(delta).toBeLessThan(THRESHOLD);
    },
    90_000
  );

  // -------------------------------------------------------------------------
  // Informational: skip message when --expose-gc is not available
  // -------------------------------------------------------------------------

  it.runIf(!hasGc)(
    'memory shape tests SKIPPED — run with --expose-gc (vitest forks pool: execArgv)',
    () => {
      console.log(
        '[memory-shape] SKIPPED: globalThis.gc is not a function. ' +
          'Ensure vitest.config.ts pool="forks" with execArgv=["--expose-gc"] ' +
          'and run via: pnpm test:memory'
      );
      // This test passes trivially — it exists only to emit the skip message.
      expect(hasGc).toBe(false);
    }
  );
});
