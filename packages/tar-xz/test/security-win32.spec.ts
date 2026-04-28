/**
 * Security regression gate — Win32 TOCTOU hardening (WIN32-TOCTOU-2026-04-29)
 *
 * Tests the 4 BDD scenarios from the spec §5 that verify the Win32 fail-closed
 * `'wx'` + retry pattern added to `extractFile`.
 *
 * Platform note: these tests run on ALL platforms (Linux, macOS, Windows).
 * On Linux/macOS, `process.platform` is stubbed to `'win32'` via `vi.stubGlobal`
 * so the new Win32 branch is exercised on every CI runner. The stub reaches the
 * inline `process.platform !== 'win32'` check in `file.ts` because the check is
 * evaluated inside the async function body at call time — no top-level `isWindows`
 * const, no ESM hoisting concern. (Verified adversarially 2026-04-29; see §10 risk
 * register in the spec.)
 *
 * Vector map:
 *  W1  — lstat check → open()  — closed by 'wx' atomic create (EEXIST path)
 *  W2  — open() → last byte    — CLOSED: fd held open, writes via handle.write()
 *  W3  — last byte → chmod     — CLOSED: fd-based handle.chmod()
 *  W4  — chmod → utimes        — CLOSED: fd-based handle.utimes()
 */

import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { xzSync } from 'node-liblzma';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractFile } from '../src/node/file.js';
import { calculatePadding, createEndOfArchive, createHeader } from '../src/tar/format.js';

// Replace the module with a proxy so vi.spyOn intercepts named imports in file.ts.
// Without this, ESM named bindings in file.ts are separate live references that
// vi.spyOn on the namespace object cannot intercept.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual };
});

// ---------------------------------------------------------------------------
// Helpers (self-contained — no shared imports from other test files)
// ---------------------------------------------------------------------------

/** Build a minimal TAR buffer with a single regular-file entry. */

/** Stubs process.platform to 'win32' via Object.create so non-enumerable
 *  Node.js APIs (EventEmitter, env, argv, etc.) remain intact on the stub. */
function stubWin32Platform(): void {
  const processStub = Object.create(process) as NodeJS.Process;
  Object.defineProperty(processStub, 'platform', {
    value: 'win32',
    configurable: true,
  });
  vi.stubGlobal('process', processStub);
}

function buildSingleFileTar(name: string, content: Buffer): Buffer {
  const blocks: Buffer[] = [];
  const header = createHeader({ name, size: content.length });
  blocks.push(Buffer.from(header));
  blocks.push(content);
  const pad = calculatePadding(content.length);
  if (pad > 0) blocks.push(Buffer.alloc(pad));
  blocks.push(Buffer.from(createEndOfArchive()));
  return Buffer.concat(blocks);
}

/** Compress a TAR buffer and write it to archivePath on disk. */
async function saveTarXz(tar: Buffer, archivePath: string): Promise<void> {
  await fsp.writeFile(archivePath, xzSync(tar));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Win32 extractFile fail-closed under symlink-swap race', () => {
  let tmp: string;
  let archivePath: string;

  // Detect symlink creation capability once per suite.
  // On Windows without Developer Mode or admin rights, fsp.symlink() throws
  // EPERM even for file→file symlinks under a temp dir. We gate only the
  // assertion that verifies the injected symlink is intact (not the throw
  // itself — the throw originates from the mock, not from a privileged path).
  let canCreateSymlinks = true;
  beforeAll(async () => {
    const probeDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tar-xz-probe-'));
    try {
      await fsp.symlink(path.join(probeDir, 'src.txt'), path.join(probeDir, 'link.txt'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EPERM') {
        canCreateSymlinks = false;
      }
    } finally {
      await fsp.rm(probeDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  beforeEach(async () => {
    tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'tar-xz-win32-'));
    archivePath = path.join(tmp, 'archive.tar.xz');
    // Stub process.platform to 'win32' so the new Win32 branch is exercised
    // on all CI platforms (Linux, macOS, Windows), while preserving the
    // original process object's non-enumerable properties and methods.
    stubWin32Platform();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Atomic create succeeds when target does not exist
  // AC-1: 'wx' is used; AC-3: handle.chmod / handle.utimes via fd
  // -------------------------------------------------------------------------

  it('writes file cleanly when target does not exist (atomic create, no EEXIST)', async () => {
    const content = Buffer.from('hello world');
    const tar = buildSingleFileTar('output.txt', content);
    await saveTarXz(tar, archivePath);

    const dest = path.join(tmp, 'dest');
    await fsp.mkdir(dest);

    await extractFile(archivePath, { cwd: dest });

    const written = await fsp.readFile(path.join(dest, 'output.txt'));
    expect(written).toStrictEqual(content);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Legitimate overwrite via unlink + retry
  // AC-2: EEXIST → unlink → retry-'wx' → success
  // -------------------------------------------------------------------------

  it('overwrites existing regular file via unlink + retry (legitimate overwrite)', async () => {
    const originalContent = Buffer.from('original');
    const newContent = Buffer.from('replaced');

    const tar = buildSingleFileTar('victim.txt', newContent);
    await saveTarXz(tar, archivePath);

    const dest = path.join(tmp, 'dest');
    await fsp.mkdir(dest);

    // Pre-create the target as a regular file (triggers EEXIST on first 'wx')
    await fsp.writeFile(path.join(dest, 'victim.txt'), originalContent);

    await extractFile(archivePath, { cwd: dest });

    const written = await fsp.readFile(path.join(dest, 'victim.txt'));
    expect(written).toStrictEqual(newContent);
  });

  // -------------------------------------------------------------------------
  // Scenario 3 (observable success proof): Symlink-swap race is detected
  // and extraction fails closed.
  //
  // Simulates an attacker that wins the race between our unlink() and our
  // retry-'wx' open by injecting a symlink in the mock.
  //
  // BEFORE fix: extract() resolves and writes through the symlink.
  // AFTER fix:  extract() rejects with /symlink-swap race detected/
  //             AND no bytes are written through the symlink.
  // -------------------------------------------------------------------------

  // On Windows without Developer Mode, symlink creation requires admin rights.
  // The throw still comes from our mock (injected EEXIST path) even when
  // symlink creation would fail; only the post-throw verification assertions
  // (isSymbolicLink / readlink) require the symlink to exist.
  it.skipIf(process.platform === 'win32' && !canCreateSymlinks)(
    'throws security error when symlink-swap race is detected (Win32)',
    async () => {
      const content = Buffer.from('pwned');
      const tar = buildSingleFileTar('victim.txt', content);
      await saveTarXz(tar, archivePath);

      const dest = path.join(tmp, 'dest');
      await fsp.mkdir(dest);

      const target = path.join(dest, 'victim.txt');
      // Pre-create the attacker's target file under tmp so the symlink points
      // to a path that exists on every platform (avoids /dev/null which is
      // POSIX-only and may behave differently on Windows runners).
      const attackerTarget = path.join(tmp, 'attacker-target.txt');
      await fsp.writeFile(attackerTarget, 'attacker content');

      // Pre-create target as a regular file so first 'wx' hits EEXIST
      await fsp.writeFile(target, 'legit');

      // Mock fsp.unlink: perform the real unlink, then inject a symlink before
      // our retry-'wx' open runs. This simulates the attacker winning the race.
      const origUnlink = fsp.unlink.bind(fsp);
      vi.spyOn(fsp, 'unlink').mockImplementationOnce(async (p) => {
        await origUnlink(p as string);
        // Attacker injects a symlink pointing to a file under our own tmp dir
        // (cross-platform: no reliance on /dev/null or other POSIX-only paths).
        await fsp.symlink(attackerTarget, target);
      });

      await expect(extractFile(archivePath, { cwd: dest })).rejects.toThrow(
        /target still exists on retry/
      );

      // Critical: target must still be the attacker's symlink (we did NOT
      // overwrite it and did NOT unlink it a second time).
      const stat = await fsp.lstat(target);
      expect(stat.isSymbolicLink()).toBe(true);

      // Critical: the symlink still points to the attacker's file — we did
      // not follow it. Use path.normalize for cross-platform path comparison.
      const linkTarget = await fsp.readlink(target);
      expect(path.normalize(linkTarget)).toBe(path.normalize(attackerTarget));
    }
  );

  // -------------------------------------------------------------------------
  // Scenario 4: Pre-existing symlink is rejected upstream (regression lock)
  //
  // The upstream leaf-lstat check (ensureSafeTarget) rejects this before
  // the 'wx' code path is ever reached. This test locks that upstream gate
  // so future changes cannot inadvertently bypass it and expose the race.
  // -------------------------------------------------------------------------

  it('rejects pre-existing symlink at target via upstream leaf-lstat check (regression lock)', async () => {
    const content = Buffer.from('evil');
    const tar = buildSingleFileTar('victim.txt', content);
    await saveTarXz(tar, archivePath);

    const dest = path.join(tmp, 'dest');
    await fsp.mkdir(dest);

    // Pre-plant a symlink at the target path — upstream ensureSafeTarget must
    // catch it before extractFile reaches the 'wx' open.
    // Use a temp path under our own tmp dir (cross-platform; avoids /dev/null).
    const symlinkTarget4 = path.join(tmp, 'existing-file.txt');
    await fsp.writeFile(symlinkTarget4, 'existing');
    await fsp.symlink(symlinkTarget4, path.join(dest, 'victim.txt'));

    // The error message comes from ensureSafeTarget (upstream), not from the
    // Win32 'wx' retry path — the upstream check fires first.
    await expect(extractFile(archivePath, { cwd: dest })).rejects.toThrow(/symlink/i);

    // The symlink must still exist (not overwritten).
    const stat = await fsp.lstat(path.join(dest, 'victim.txt'));
    expect(stat.isSymbolicLink()).toBe(true);
  });
});
