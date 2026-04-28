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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  beforeEach(async () => {
    tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'tar-xz-win32-'));
    archivePath = path.join(tmp, 'archive.tar.xz');
    // Stub process.platform to 'win32' so the new Win32 branch is exercised
    // on all CI platforms (Linux, macOS, Windows).
    vi.stubGlobal('process', { ...process, platform: 'win32' });
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

  it('throws security error when symlink-swap race is detected (Win32)', async () => {
    const content = Buffer.from('pwned');
    const tar = buildSingleFileTar('victim.txt', content);
    await saveTarXz(tar, archivePath);

    const dest = path.join(tmp, 'dest');
    await fsp.mkdir(dest);

    const target = path.join(dest, 'victim.txt');
    // Pre-create target as a regular file so first 'wx' hits EEXIST
    await fsp.writeFile(target, 'legit');

    // Mock fsp.unlink: perform the real unlink, then inject a symlink before
    // our retry-'wx' open runs. This simulates the attacker winning the race.
    const origUnlink = fsp.unlink.bind(fsp);
    vi.spyOn(fsp, 'unlink').mockImplementationOnce(async (p) => {
      await origUnlink(p as string);
      // Attacker injects a symlink pointing to /dev/null (safe for CI).
      // On a real attack this would be /etc/shadow or a co-tenant file.
      await fsp.symlink('/dev/null', target);
    });

    await expect(extractFile(archivePath, { cwd: dest })).rejects.toThrow(
      /symlink-swap race detected/
    );

    // Critical: target must still be the attacker's symlink (we did NOT
    // overwrite it and did NOT unlink it a second time).
    const stat = await fsp.lstat(target);
    expect(stat.isSymbolicLink()).toBe(true);

    // Critical: the symlink still points to /dev/null — we did not follow it.
    const linkTarget = await fsp.readlink(target);
    expect(linkTarget).toBe('/dev/null');
  });

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
    await fsp.symlink('/dev/null', path.join(dest, 'victim.txt'));

    // The error message comes from ensureSafeTarget (upstream), not from the
    // Win32 'wx' retry path — the upstream check fires first.
    await expect(extractFile(archivePath, { cwd: dest })).rejects.toThrow(/symlink/i);

    // The symlink must still point to /dev/null (not overwritten).
    const stat = await fsp.lstat(path.join(dest, 'victim.txt'));
    expect(stat.isSymbolicLink()).toBe(true);
  });
});
