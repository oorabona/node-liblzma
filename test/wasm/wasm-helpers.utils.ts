/**
 * Test helpers for loading the WASM module in Node.js.
 *
 * `initModule()` now reads the sibling `liblzma.wasm` automatically on Node and
 * Deno (zero config), so tests no longer need to supply `moduleArg.wasmBinary`
 * by hand — calling it with no arguments exercises the default loader path.
 */

import { initModule, resetModule } from '../../src/wasm/bindings.js';
import type { LZMAModule } from '../../src/wasm/types.js';

/**
 * Load the WASM module for Node.js testing via the zero-config default loader.
 */
export async function loadWasmModule(): Promise<LZMAModule> {
  return initModule();
}

/**
 * Reset the module singleton between test suites.
 */
export function unloadWasmModule(): void {
  resetModule();
}
