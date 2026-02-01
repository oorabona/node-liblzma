/**
 * Browser demo for node-liblzma WASM.
 *
 * This file is loaded by Vite which resolves the "browser" condition
 * from package.json exports, routing to the WASM implementation.
 */

// biome-ignore lint/correctness/noUnusedImports: resolved at runtime via Vite browser condition
import {
  createUnxz,
  createXz,
  initModule,
  isXZ,
  LZMAError,
  parseFileIndex,
  unxzAsync,
  versionNumber,
  versionString,
  xzAsync,
  xzSync,
} from 'node-liblzma';

// --- Logging helpers ---

const logEl = document.getElementById('log')!;

function log(msg: string, cls: string = '') {
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = `${msg}\n`;
  logEl.appendChild(span);
  logEl.scrollTop = logEl.scrollHeight;
}

function logInfo(msg: string) {
  log(msg, 'log-info');
}
function logSuccess(msg: string) {
  log(msg, 'log-success');
}
function logError(msg: string) {
  log(msg, 'log-error');
}
function logData(msg: string) {
  log(msg, 'log-data');
}

function updateStat(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
  const stats = document.getElementById('stats');
  if (stats) stats.style.display = 'grid';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// --- Test functions (exposed to window for onclick) ---

async function runBufferTest() {
  const input = (document.getElementById('input-text') as HTMLTextAreaElement).value;
  if (!input) {
    logError('Please enter some text.');
    return;
  }

  logInfo(`--- Buffer API Test ---`);
  logInfo(
    `Input: ${input.length} chars (${formatBytes(new TextEncoder().encode(input).byteLength)})`
  );

  try {
    const t0 = performance.now();
    const compressed = await xzAsync(input);
    const compressMs = performance.now() - t0;

    logData(
      `Compressed: ${formatBytes(compressed.byteLength)} (ratio: ${((compressed.byteLength / new TextEncoder().encode(input).byteLength) * 100).toFixed(1)}%)`
    );
    logData(`Compress time: ${compressMs.toFixed(1)}ms`);

    const t1 = performance.now();
    const decompressed = await unxzAsync(compressed);
    const decompressMs = performance.now() - t1;

    const output = new TextDecoder().decode(decompressed);
    logData(`Decompress time: ${decompressMs.toFixed(1)}ms`);

    if (output === input) {
      logSuccess(`Roundtrip OK — output matches input (${output.length} chars)`);
    } else {
      logError(`MISMATCH! Input ${input.length} chars, output ${output.length} chars`);
    }

    // Update stats
    const inputBytes = new TextEncoder().encode(input).byteLength;
    updateStat('stat-ratio', `${((compressed.byteLength / inputBytes) * 100).toFixed(1)}%`);
    updateStat('stat-compress', `${compressMs.toFixed(1)}ms`);
    updateStat('stat-decompress', `${decompressMs.toFixed(1)}ms`);
  } catch (err) {
    logError(`Error: ${err}`);
  }
}

async function runLargeTest() {
  logInfo(`--- Large Buffer Test (100KB) ---`);

  // Generate 100KB of compressible text
  const chunk = 'The quick brown fox jumps over the lazy dog. ';
  const repeat = Math.ceil(102400 / chunk.length);
  const largeText = chunk.repeat(repeat).slice(0, 102400);
  const inputBytes = new TextEncoder().encode(largeText).byteLength;
  logInfo(`Generated ${formatBytes(inputBytes)} of text`);

  try {
    const t0 = performance.now();
    const compressed = await xzAsync(largeText);
    const compressMs = performance.now() - t0;

    logData(
      `Compressed: ${formatBytes(compressed.byteLength)} (ratio: ${((compressed.byteLength / inputBytes) * 100).toFixed(1)}%)`
    );
    logData(`Compress time: ${compressMs.toFixed(1)}ms`);
    logData(`Throughput: ${(inputBytes / 1024 / (compressMs / 1000)).toFixed(0)} KB/s`);

    const t1 = performance.now();
    const decompressed = await unxzAsync(compressed);
    const decompressMs = performance.now() - t1;

    logData(`Decompress time: ${decompressMs.toFixed(1)}ms`);
    logData(
      `Throughput: ${(compressed.byteLength / 1024 / (decompressMs / 1000)).toFixed(0)} KB/s`
    );

    const output = new TextDecoder().decode(decompressed);
    if (output === largeText) {
      logSuccess(
        `Roundtrip OK — ${formatBytes(inputBytes)} → ${formatBytes(compressed.byteLength)} → ${formatBytes(decompressed.byteLength)}`
      );
    } else {
      logError(`MISMATCH! Expected ${largeText.length} chars, got ${output.length}`);
    }

    updateStat('stat-ratio', `${((compressed.byteLength / inputBytes) * 100).toFixed(1)}%`);
    updateStat('stat-compress', `${compressMs.toFixed(1)}ms`);
    updateStat('stat-decompress', `${decompressMs.toFixed(1)}ms`);
  } catch (err) {
    logError(`Error: ${err}`);
  }
}

async function runPresetTest() {
  logInfo(`--- Preset Comparison (0-6) ---`);

  const input =
    'A'.repeat(10000) + 'B'.repeat(5000) + 'C'.repeat(3000) + 'Hello World! '.repeat(500);
  const inputBytes = new TextEncoder().encode(input).byteLength;
  logInfo(`Input: ${formatBytes(inputBytes)}`);

  for (let preset = 0; preset <= 6; preset++) {
    try {
      const t0 = performance.now();
      const compressed = await xzAsync(input, { preset });
      const ms = performance.now() - t0;
      logData(
        `  Preset ${preset}: ${formatBytes(compressed.byteLength)} (${((compressed.byteLength / inputBytes) * 100).toFixed(1)}%) in ${ms.toFixed(1)}ms`
      );
    } catch (err) {
      logError(`  Preset ${preset}: ${err}`);
    }
  }
  logSuccess('Preset comparison complete');
}

async function runStreamTest() {
  logInfo(`--- Streaming API Test ---`);

  const input = 'Stream test data. '.repeat(2000);
  const inputBytes = new TextEncoder().encode(input).byteLength;
  logInfo(`Input: ${formatBytes(inputBytes)}`);

  try {
    // Create compress stream
    const xzStream = createXz({ preset: 3 });
    const unxzStream = createUnxz();

    // Create a readable stream from text
    const encoder = new TextEncoder();
    const inputStream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Feed in chunks
        const data = encoder.encode(input);
        const chunkSize = 4096;
        for (let i = 0; i < data.byteLength; i += chunkSize) {
          controller.enqueue(data.slice(i, i + chunkSize));
        }
        controller.close();
      },
    });

    logInfo('Compressing via stream...');
    const t0 = performance.now();

    // Pipe: input → compress → decompress
    const decompressedStream = inputStream.pipeThrough(xzStream).pipeThrough(unxzStream);

    // Collect output
    const chunks: Uint8Array[] = [];
    const reader = decompressedStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalMs = performance.now() - t0;

    // Merge chunks
    const totalLen = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const output = new TextDecoder().decode(merged);
    logData(`Stream roundtrip: ${totalMs.toFixed(1)}ms`);

    if (output === input) {
      logSuccess(`Stream roundtrip OK — ${chunks.length} chunks, ${formatBytes(totalLen)}`);
    } else {
      logError(`Stream MISMATCH! Expected ${input.length} chars, got ${output.length}`);
    }
  } catch (err) {
    logError(`Stream error: ${err}`);
  }
}

function updateProgress(label: string, pct: number) {
  const container = document.getElementById('progress-container');
  const bar = document.getElementById('progress-bar');
  const pctEl = document.getElementById('progress-pct');
  const labelEl = document.getElementById('progress-label');
  if (container) container.style.display = 'block';
  if (bar) bar.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
  if (labelEl) labelEl.textContent = label;
}

/**
 * Create a TransformStream that reports progress based on bytes flowing through.
 */
function createProgressStream(
  totalBytes: number,
  label: string
): TransformStream<Uint8Array, Uint8Array> {
  let bytesProcessed = 0;
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesProcessed += chunk.byteLength;
      const pct = Math.min(100, (bytesProcessed / totalBytes) * 100);
      updateProgress(label, pct);
      controller.enqueue(chunk);
    },
    flush() {
      updateProgress(label, 100);
    },
  });
}

async function runProgressTest() {
  logInfo(`--- Stream with Progress Bar ---`);

  // Generate 500KB of semi-compressible data
  const parts: string[] = [];
  const phrases = [
    'The quick brown fox jumps over the lazy dog. ',
    'Pack my box with five dozen liquor jugs. ',
    'How vexingly quick daft zebras jump. ',
    'Sphinx of black quartz, judge my vow. ',
  ];
  while (new Blob(parts).size < 512000) {
    parts.push(phrases[Math.floor(Math.random() * phrases.length)]);
    // Mix in some random-ish data to slow down compression
    if (Math.random() < 0.1) {
      parts.push(String(Math.random()).repeat(5));
    }
  }
  const largeText = parts.join('');
  const inputData = new TextEncoder().encode(largeText);
  const inputBytes = inputData.byteLength;
  logInfo(`Input: ${formatBytes(inputBytes)}`);

  try {
    // --- Phase 1: Compress with progress ---
    updateProgress('Compressing...', 0);
    const t0 = performance.now();

    // Feed data in small chunks via a ReadableStream
    const chunkSize = 8192;
    const inputStream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < inputData.byteLength; i += chunkSize) {
          controller.enqueue(inputData.slice(i, i + chunkSize));
        }
        controller.close();
      },
    });

    // Pipe: input → progress → compress
    const progressIn = createProgressStream(inputBytes, 'Compressing...');
    const compressedStream = inputStream
      .pipeThrough(progressIn)
      .pipeThrough(createXz({ preset: 3 }));

    // Collect compressed output
    const compressedChunks: Uint8Array[] = [];
    const compReader = compressedStream.getReader();
    while (true) {
      const { done, value } = await compReader.read();
      if (done) break;
      compressedChunks.push(value);
    }
    const compressMs = performance.now() - t0;

    const compressedSize = compressedChunks.reduce((sum, c) => sum + c.byteLength, 0);
    const compressed = new Uint8Array(compressedSize);
    let off = 0;
    for (const c of compressedChunks) {
      compressed.set(c, off);
      off += c.byteLength;
    }

    logData(
      `Compressed: ${formatBytes(compressedSize)} (ratio: ${((compressedSize / inputBytes) * 100).toFixed(1)}%) in ${compressMs.toFixed(0)}ms`
    );

    // --- Phase 2: Decompress with progress ---
    updateProgress('Decompressing...', 0);
    const t1 = performance.now();

    const compStream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < compressed.byteLength; i += chunkSize) {
          controller.enqueue(compressed.slice(i, i + chunkSize));
        }
        controller.close();
      },
    });

    const progressOut = createProgressStream(compressedSize, 'Decompressing...');
    const decompressedStream = compStream.pipeThrough(progressOut).pipeThrough(createUnxz());

    const decompChunks: Uint8Array[] = [];
    const decReader = decompressedStream.getReader();
    while (true) {
      const { done, value } = await decReader.read();
      if (done) break;
      decompChunks.push(value);
    }
    const decompressMs = performance.now() - t1;

    const decompSize = decompChunks.reduce((sum, c) => sum + c.byteLength, 0);
    logData(`Decompressed: ${formatBytes(decompSize)} in ${decompressMs.toFixed(0)}ms`);

    updateProgress('Done', 100);

    if (decompSize === inputBytes) {
      logSuccess(
        `Progress stream roundtrip OK — ${formatBytes(inputBytes)} → ${formatBytes(compressedSize)} → ${formatBytes(decompSize)}`
      );
    } else {
      logError(`Size mismatch: expected ${inputBytes}, got ${decompSize}`);
    }
  } catch (err) {
    logError(`Progress test error: ${err}`);
  }
}

async function runUtilsTest() {
  logInfo(`--- Utility Functions ---`);

  try {
    const ver = versionString();
    const num = versionNumber();
    logData(`liblzma version: ${ver} (${num})`);
    updateStat('stat-version', ver);

    // Test isXZ on compressed data
    const compressed = await xzAsync('test');
    logData(`isXZ(compressed): ${isXZ(compressed)}`);
    logData(`isXZ(random): ${isXZ(new Uint8Array([1, 2, 3, 4, 5, 6]))}`);

    // XZ magic bytes check
    const magic = Array.from(compressed.slice(0, 6))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    logData(`XZ magic bytes: ${magic} (expected: fd 37 7a 58 5a 00)`);

    logSuccess('Utils test complete');
  } catch (err) {
    logError(`Utils error: ${err}`);
  }
}

async function runFileIndexTest() {
  logInfo(`--- Parse File Index ---`);

  try {
    const data = 'Hello World! '.repeat(100);
    const compressed = await xzAsync(data);
    const info = parseFileIndex(compressed);
    logData(`Compressed size: ${info.compressedSize}`);
    logData(`Uncompressed size: ${info.uncompressedSize}`);
    logData(`Stream count: ${info.streamCount}`);
    logData(`Check type: ${info.check}`);
    logSuccess('File index parsed successfully');
  } catch (err) {
    logError(`File index error: ${err}`);
  }
}

async function runSyncErrorTest() {
  logInfo(`--- Sync API Error Test ---`);
  logInfo('Calling xzSync() — should throw LZMAError in browser...');

  try {
    xzSync('test');
    logError('BUG: xzSync should have thrown!');
  } catch (err) {
    if (err instanceof LZMAError) {
      logSuccess(`Correctly threw LZMAError: ${err.message}`);
    } else {
      logData(`Threw non-LZMAError: ${err}`);
    }
  }
}

async function runCorruptDataTest() {
  logInfo(`--- Corrupt Data Test ---`);

  try {
    // XZ magic bytes followed by garbage
    const corrupt = new Uint8Array([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00, 0xff, 0xff, 0xff]);
    await unxzAsync(corrupt);
    logError('BUG: should have thrown on corrupt data!');
  } catch (err) {
    if (err instanceof LZMAError) {
      logSuccess(`Correctly threw LZMAError: ${err.message}`);
    } else {
      logSuccess(`Threw error: ${err}`);
    }
  }
}

// Expose to window for onclick handlers
Object.assign(window, {
  runBufferTest,
  runLargeTest,
  runPresetTest,
  runStreamTest,
  runProgressTest,
  runUtilsTest,
  runFileIndexTest,
  runSyncErrorTest,
  runCorruptDataTest,
});

// Initialize WASM module, then run version check
logInfo('node-liblzma browser demo — initializing WASM module...');

initModule()
  .then(() => {
    logSuccess('WASM module initialized');
    runUtilsTest();
  })
  .catch((err) => {
    logError(`Failed to initialize WASM module: ${err}`);
  });
