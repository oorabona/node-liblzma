---
'node-liblzma': minor
---

Wire `memlimit` through the native N-API decoder, closing the WASM↔native asymmetry advertised in TSDoc since the v5.x line.

`Unxz`, `createUnxz`, and the `unxz`/`unxzAsync` Buffer APIs now all honor `LZMAOptions.memlimit`:

```ts
const stream = new Unxz({ memlimit: 64 * 1024 * 1024 }); // 64 MiB
// → emits 'error' with LZMAMemoryLimitError on real .xz exceeding the limit
```

**Changes**
- N-API `InitializeDecoder` reads `opts.memlimit` and passes it to `lzma_stream_decoder` (was hardcoded to `UINT64_MAX`).
- JS-side `validateMemlimit` (now exported from `src/wasm/bindings.ts`) is reused at the `Xz`/`Unxz` constructor entry, so NaN/Infinity/fractional/negative/`> Number.MAX_SAFE_INTEGER`/`> UINT64_MAX` are caught synchronously with `LZMAOptionsError` regardless of whether the eventual decoder is native or WASM.
- New bigint upper-bound guard: `memlimit > 18446744073709551615n` (`UINT64_MAX`) now rejected, preventing silent BigInt→uint64 truncation.

**TSDoc** updated to remove the "WASM only" caveat — `memlimit` is now uniform across all decoder paths.

Default behavior is preserved: when `memlimit` is omitted, the native decoder uses `UINT64_MAX` (no limit), and the WASM Buffer API uses 256 MiB (its existing default).
