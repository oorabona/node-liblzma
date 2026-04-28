---
'tar-xz': patch
---

Win32 extractFile fail-closed under symlink-swap race (JS-pure).

Replaces the by-path `createWriteStream` Windows fallback with an fd-based
`open('wx')` + unlink-then-retry pattern. If a symlink is injected between
the unlink and the retry-open (symlink-swap race), extraction rejects with a
security error instead of writing through the symlink.

```ts
// Race-injected symlink now throws a security error instead of writing
// through the target path.
```

## What changed

- **`open(target, 'wx', mode)`** — atomic exclusive create (`O_CREAT | O_EXCL`
  in libuv). Succeeds only if the target does not exist.
- **EEXIST → unlink + retry** — legitimate re-extract of an existing regular
  file: unlink the old file, retry `open('wx')`.
- **Second EEXIST → security error** — attacker injected a symlink or junction
  between `unlink` and the retry-open. Fail-closed.
- **fd-based write/chmod/utimes** — all post-open I/O through the `FileHandle`,
  immune to by-path swaps after open.

## Threat windows closed

| Window | Status |
|--------|--------|
| W1: lstat check → open() | Closed — atomic `'wx'` detects injection |
| W2: open() → last byte | Closed — fd-based writes |
| W3: last byte → chmod | Closed — `handle.chmod()` |
| W4: chmod → utimes | Closed — `handle.utimes()` |

## Reparse-point coverage

`IO_REPARSE_TAG_SYMLINK`: detected by upstream `lstat` check before `'wx'` is
attempted. `IO_REPARSE_TAG_MOUNT_POINT` (junctions) and cloud-file placeholders:
not detected by `lstat`, but leaf is protected by `'wx'` EEXIST fail-closed.
Ancestor junctions remain a residual risk (pre-existing, shared with `node-tar`).
See `packages/tar-xz/SECURITY.md§"Windows symlink-swap TOCTOU"` for the full table.

## No API change

`extract()` / `extractFile()` signatures and behavior are unchanged for all
non-race paths. This is a pure security hardening with no functional regression.
