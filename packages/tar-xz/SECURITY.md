# tar-xz Security Notes

## Windows symlink-swap TOCTOU

### Background

On POSIX (Linux, macOS), `extractFile` opens each regular-file entry with
`O_NOFOLLOW` (`O_CREAT | O_WRONLY | O_TRUNC | O_NOFOLLOW`). This ensures the
kernel refuses to open a symlink at the leaf path, closing the symlink-swap
attack window from the moment the file handle is opened.

On Windows, `O_NOFOLLOW` is not available (libuv/Win32 does not expose it).
Prior to this hardening, the Windows path used `createWriteStream(target)` — a
by-path operation that could be redirected by a symlink injected between the
upstream safety check and the final write.

### What changed in this hardening

The Windows extraction path now uses `open(target, 'wx', mode)` — the `'wx'`
flag maps to `O_CREAT | O_EXCL` in libuv, an atomic "create or fail" syscall.
Writes, `chmod`, and `utimes` are all performed through the resulting
`FileHandle`, immune to any by-path swap after the open.

The full sequence:

1. **First `open('wx')`** — succeeds if the target does not exist (no prior
   file or symlink at that path). All subsequent I/O via the file descriptor.
2. **`EEXIST` on first open** — a regular file exists (legitimate re-extract
   case): call `unlink(target)` then retry `open('wx')`.
3. **`EEXIST` on retry** — a symlink (or other reparse point) was injected
   between our `unlink` and our retry-open. Extraction is rejected with a
   security error citing the entry name. No bytes are written.

### Closed attack windows

| Window | From → To | Status |
|--------|-----------|--------|
| W1 | `lstat` check → `open()` | Closed — atomic `'wx'` EEXIST-path detects injection |
| W2 | `open()` → last byte written | Closed — fd-based `handle.write()` follows the inode, not the path |
| W3 | last byte → `chmod` | Closed — `handle.chmod()` (fd-based) |
| W4 | `chmod` → `utimes` | Closed — `handle.utimes()` (fd-based) |

### Residual race

The `open()` syscall itself is atomic at the OS level (sub-microsecond). A
symlink injected **during** the `open()` syscall cannot win — the kernel either
creates the new inode or returns `EEXIST` atomically. There is no window inside
`open()`.

### Reparse-point coverage table

Windows supports several reparse-point types beyond `IO_REPARSE_TAG_SYMLINK`.
The table below documents what each type means for the `'wx'` fail-closed contract:

| Reparse tag | Detected by `lstat().isSymbolicLink()` | Behavior under `'wx'` | Risk level |
|-------------|----------------------------------------|----------------------|------------|
| `IO_REPARSE_TAG_SYMLINK` | **Yes** — rejected by upstream `ensureSafeTarget` before `'wx'` is attempted | n/a (caught upstream) | None |
| `IO_REPARSE_TAG_MOUNT_POINT` (NTFS junction) | **No** — `lstat` returns `isSymbolicLink() === false` for junctions | `'wx'` returns `EEXIST` → `unlink` removes the junction → retry `'wx'` succeeds or attacker re-injects → security error | **Leaf protected** by `'wx'` EEXIST fail-closed |
| OneDrive / cloud-files placeholders (`IO_REPARSE_TAG_CLOUD_FILES`, etc.) | **No** — cloud stubs look like regular files to `lstat` | `'wx'` returns `EEXIST` → handled via normal overwrite path (unlink + retry) | Low — cloud stubs are regular-file-like; write lands on the stub, which hydrates on access |
| `IO_REPARSE_TAG_AF_UNIX` | **No** | `'wx'` returns `EEXIST` → unlink + retry path | Low — same as junction path |

**Summary:** The only reparse type that can be present at the *leaf* target
path and bypasses `isSymbolicLink()` is `IO_REPARSE_TAG_MOUNT_POINT`
(NTFS junctions). The `'wx'` fail-closed pattern protects the leaf in all
cases — if an attacker injects a junction between `unlink` and the retry-open,
`'wx'` returns `EEXIST` and we throw the security error.

**Ancestor junctions (residual risk):** The upstream `hasSymlinkAncestor`
walk uses `lstat().isSymbolicLink()` and does not detect junctions in ancestor
directories. This is a pre-existing limitation shared by `node-tar` and other
pure-JS tar libraries. It is not introduced by this change. See "User
mitigations" below.

### Notes on hardlinks, case-insensitive NTFS, and ADS

**Hardlinks:** A hardlink injected during the unlink+retry race creates a
directory entry at the target path. Our retry `'wx'` returns `EEXIST` →
security error (fail-closed). Pre-existing hardlinks are regular files that
share an inode; `unlink` decrements the link count and our `'wx'` creates a
new inode. Semantically correct.

**Case-insensitive NTFS:** All path operations resolve to the same directory
entry regardless of case. This is not a bypass vector — `path.resolve` produces
a canonical path that is used consistently.

**NTFS Alternate Data Streams (ADS):** Out of scope. ADS does not affect the
default data stream. Tar entry names containing `:` are rejected upstream by
path-traversal validation before reaching this code.

### User mitigations

For environments where even the residual ancestor-junction risk is unacceptable:

1. **Restricted-ACL temp directory** — extract under a directory with an ACL
   that prevents other users/processes from creating files or junctions inside
   it. On Windows, use `CreateDirectory` + `SetSecurityInfo` to set a DACL
   that grants write access only to the calling process's SID.
2. **Prefer WSL for untrusted archives** — Windows Subsystem for Linux uses
   the Linux VFS with full `O_NOFOLLOW` support. `extractFile` on WSL takes the
   POSIX branch and is fully protected.
3. **Verify archive origin** — do not extract archives from untrusted sources
   into directories writable by other processes (world-writable temp dirs,
   shared application data folders, etc.).
