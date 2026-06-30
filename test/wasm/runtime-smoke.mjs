// Cross-runtime WASM smoke for node-liblzma#165.
// Runs on Node and Deno against the BUILT output (lib/wasm). Exercises both
// i64 boundaries that broke under strict-BigInt engines (Node 26, Deno):
//   - createUnxz()  -> decoderInit -> _lzma_stream_decoder(ptr, i64, 0)   (function arg)
//   - unxzAsync()   -> streamBufferDecode -> setValue(ptr, i64, 'i64')    (heap write)
// Also asserts the zero-config loader: initModule() with no arguments must load
// the sibling .wasm on both Node and Deno (no custom wasmBinary loader needed).
// Requires the package to be built first (`pnpm build`). Exits non-zero on failure.
import { createUnxz, createXz, initModule, unxzAsync, xzAsync } from '../../lib/wasm/index.js';

// Zero-config: the default loader reads the sibling liblzma.wasm on Node/Deno.
await initModule();

const te = new TextEncoder();

function readableOf(bytes) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function exit(code) {
  if (typeof process !== 'undefined' && process.exit) process.exit(code);
  else if (typeof Deno !== 'undefined') Deno.exit(code);
  else if (code !== 0) throw new Error(`smoke failed (code ${code})`);
}

const data = te.encode('node-liblzma#165 wasm runtime smoke '.repeat(2000));

// Stream path (the reported crash site).
const streamCompressed = await collect(readableOf(data).pipeThrough(createXz()));
const streamRestored = await collect(readableOf(streamCompressed).pipeThrough(createUnxz()));
const streamOk = equal(streamRestored, data);

// Buffer path (setValue i64).
const bufferCompressed = await xzAsync(data);
const bufferRestored = await unxzAsync(bufferCompressed);
const bufferOk = equal(bufferRestored, data);

const runtime =
  typeof Deno !== 'undefined' ? `Deno ${Deno.version.deno}` : `Node ${process.version}`;
console.log(`[${runtime}] stream=${streamOk} buffer=${bufferOk}`);

if (!streamOk || !bufferOk) {
  console.error('WASM runtime smoke FAILED');
  exit(1);
}
console.log('WASM runtime smoke OK');
