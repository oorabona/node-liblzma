/**
 * Test helpers for loading the WASM module in Node.js.
 *
 * The Emscripten module is compiled with ENVIRONMENT='web,worker',
 * so in Node.js we must supply the WASM binary via moduleArg.wasmBinary.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initModule, resetModule } from '../../src/wasm/bindings.js';
import type { LZMAModule } from '../../src/wasm/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WASM_DIR = join(__dirname, '../../src/wasm');
const WASM_FILE = join(WASM_DIR, 'liblzma.wasm');
const GLUE_FILE = join(WASM_DIR, 'liblzma.js');

/**
 * Load the WASM module for Node.js testing.
 * Reads the .wasm binary from disk and passes it to the Emscripten factory.
 */
export async function loadWasmModule(): Promise<LZMAModule> {
  const wasmBinary = await readFile(WASM_FILE);

  return initModule(async () => {
    // Dynamic import of the Emscripten glue
    const glueUrl = new URL(`file://${GLUE_FILE}`);
    const { default: createLZMA } = await import(glueUrl.href);
    return (await createLZMA({ wasmBinary })) as LZMAModule;
  });
}

/**
 * Reset the module singleton between test suites.
 */
export function unloadWasmModule(): void {
  resetModule();
}
