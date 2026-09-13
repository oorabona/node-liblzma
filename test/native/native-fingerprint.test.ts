import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const require = createRequire(import.meta.url);
const { findPython } = require('node-gyp/lib/find-python') as {
  findPython(configPython?: string): Promise<string>;
};
const rebuildCommand = process.platform === 'win32' ? 'pnpm prebuildify:win' : 'pnpm prebuildify';
const revisionMarkerScope =
  'checked-out binding sources and control files; environment, dependency, and toolchain identity are outside this marker';

type NativeAddon = {
  NATIVE_FINGERPRINT?: unknown;
};

function loadNativeAddon(): NativeAddon {
  try {
    return require('node-gyp-build')(projectRoot) as NativeAddon;
  } catch (cause) {
    throw new Error(
      `Could not load the native addon while checking its revision marker over ${revisionMarkerScope}. Rebuild with \`${rebuildCommand}\`.`,
      { cause }
    );
  }
}

async function calculateNativeFingerprint(): Promise<string> {
  const python = await findPython(process.env.npm_config_python);
  return execFileSync(python, [path.join(projectRoot, 'scripts/native_fingerprint.py')], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
}

it('matches the native addon to the checked-out binding sources and control files', async () => {
  const nativeAddon = loadNativeAddon();
  const addonFingerprint =
    typeof nativeAddon.NATIVE_FINGERPRINT === 'string' ? nativeAddon.NATIVE_FINGERPRINT : '';
  const sourceFingerprint = await calculateNativeFingerprint();

  expect(
    addonFingerprint,
    `Native addon revision marker mismatch over ${revisionMarkerScope}: addon=${JSON.stringify(addonFingerprint)}, sources=${JSON.stringify(sourceFingerprint)}. Rebuild with \`${rebuildCommand}\`.`
  ).toBe(sourceFingerprint);
});
