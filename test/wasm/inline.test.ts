/**
 * Tests for the inline WASM entry point (node-liblzma/inline).
 *
 * Validates that ensureInlineInit correctly loads the WASM module
 * from the embedded base64 binary, caches it, and handles
 * concurrent initialization.
 *
 * Note: ensureInlineInit has a module-level `initialized` flag that
 * cannot be reset externally, so tests share initialization state.
 * The first test triggers the real init; subsequent tests verify
 * caching behavior within that same module lifecycle.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { ensureInlineInit, getModule, resetModule } from '../../src/lzma.inline.js';

describe('Inline WASM initialization', () => {
  afterAll(() => {
    resetModule();
  });

  it('should load the WASM module from inline base64', async () => {
    const mod = await ensureInlineInit();
    expect(mod).toBeDefined();
    expect(mod._malloc).toBeTypeOf('function');
    expect(mod._free).toBeTypeOf('function');
    expect(mod._lzma_easy_encoder).toBeTypeOf('function');
  });

  it('should return cached module on second call', async () => {
    const mod1 = await ensureInlineInit();
    const mod2 = await ensureInlineInit();
    expect(mod1).toBe(mod2);
  });

  it('should return same module for concurrent calls', async () => {
    const [mod1, mod2, mod3] = await Promise.all([
      ensureInlineInit(),
      ensureInlineInit(),
      ensureInlineInit(),
    ]);
    expect(mod1).toBe(mod2);
    expect(mod2).toBe(mod3);
  });

  it('should make getModule() work after initialization', async () => {
    await ensureInlineInit();
    const mod = getModule();
    expect(mod).toBeDefined();
    expect(mod._malloc).toBeTypeOf('function');
  });

  // Error recovery test: ensureInlineInit uses a module-level
  // `initialized` flag that can't be reset externally. Mocking
  // the dynamic import of Emscripten glue + base64 binary is
  // fragile. Skip — add if inline init errors surface in production.
});
