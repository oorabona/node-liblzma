---
'node-liblzma': minor
---

Add `memlimit` option to `LZMAOptions` and wire it through `unxzAsync`/`unxz` (WASM).

Callers can now set a memory usage limit for WASM decompression:

```ts
await unxzAsync(buf, { memlimit: 64 * 1024 * 1024 }); // 64 MiB limit
```

When the compressed stream would require more memory than the limit, the promise rejects with `LZMAMemoryLimitError` (`errno === LZMA_MEMLIMIT_ERROR === 6`).

**Accepted types:** `number | bigint` (both coerced to `bigint` for the WASM C ABI).
**Default:** `BigInt(256 * 1024 * 1024)` (256 MiB — unchanged from existing behaviour).

**Native parity:** Wired in the same release — see the native-memlimit changeset below for `Unxz`/`createUnxz` coverage.
