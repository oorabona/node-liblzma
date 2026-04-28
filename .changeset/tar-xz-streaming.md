---
'tar-xz': minor
---

True streaming for Node `extract()` and `list()` — memory now stays O(largest single entry) instead of O(archive). Delivers the "planned optimization" advertised by v6.0.0's stream-first README.

```ts
// 1 GB .tar.xz with 100 MB files → peak heap ~100 MB, not ~1 GB
for await (const entry of extract(bigArchive)) {
  for await (const chunk of entry.data) {
    consumer(chunk);  // chunks arrive as XZ decompresses, no pre-buffer
  }
}
```

## What changed under the hood

- New shared `parseTar(source, mode)` AsyncGenerator coroutine in `tar-parser.ts`. The old `TarUnpack`/`TarList` `Writable` classes are gone; they were artificially-buffered incremental parsers that never received true streaming input.
- `extract()` and `list()` rewired to consume `parseTar` directly via `for await`, with the consumer's iteration controlling decompression rate (natural backpressure — no explicit pause/resume).
- Deprecated helpers `collectAllChunks` / `decompressXz` / `runWritable` removed from `xz-helpers.ts` (replaced by `streamXz()`).
- New PAX-bomb DoS guard: `MAX_PAX_HEADER_BYTES = 1 MB`. Crafted archives declaring giant PAX headers throw `Error` with `code === 'TAR_PARSER_INVARIANT'`.

## Behavior changes (non-breaking but observable — Hyrum's Law)

These were always part of the streaming contract advertised by v6.0.0 but only become observable now:

1. **`entry.data` chunk count and size** now reflect the XZ decompressor's output cadence (typically 64 KB blocks). Previously: exactly one chunk per entry containing the full file. Code that assumed "one chunk per entry" or relied on `Buffer.concat` of all chunks should iterate normally — `entry.bytes()` and `entry.text()` still collect the whole file.
2. **`entry.bytes()` and `entry.text()` memoize.** Calling `bytes()` twice now returns the same buffer reference (efficient) instead of re-collecting. Memory promise preserved: at most one entry's bytes are held at a time.
3. **`entry.data` is single-use.** Iterating it twice now yields nothing on the second pass (was: same single chunk both times). If you need to re-read, call `bytes()` first and keep the reference.
4. **Consumer-break with corrupt downstream is now silent.** If you `for await ... break` and the archive is corrupt past the break point, no error surfaces. Previously the buffered model could surface the error after the loop. Errors during forward iteration still throw normally — only post-break errors are suppressed (matches `tar-stream` and JS AsyncGenerator convention).

If any of these changes break your code, please open an issue — we're prepared to ship 7.0.0 with a deprecation cycle if a reasonable reliance is demonstrated.

## Security

- POSIX path remains fd-based with `O_NOFOLLOW` — TOCTOU window unchanged.
- Windows fallback: by-path operations, so the symlink-swap window now scales with entry size in streaming mode. Mitigation: extract to a directory not writable by other processes. Win32 fd-based extraction tracked as a separate follow-up.
- See `Security model` section in the README for details.

## Native parity (out of scope this release)

The streaming refactor only affects the Node path. The browser/WASM path uses a different decompression model and remains buffered (a separate optimization).
