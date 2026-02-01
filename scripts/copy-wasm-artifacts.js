#!/usr/bin/env node
/**
 * Copy WASM artifacts (liblzma.js, liblzma.wasm) from src/wasm/ to lib/wasm/.
 * Cross-platform alternative to `cp` for the build step.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const srcDir = join(projectRoot, 'src', 'wasm');
const destDir = join(projectRoot, 'lib', 'wasm');

const artifacts = ['liblzma.js', 'liblzma.wasm'];

// Ensure destination directory exists
if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

let copied = 0;
for (const file of artifacts) {
  const src = join(srcDir, file);
  const dest = join(destDir, file);
  if (existsSync(src)) {
    copyFileSync(src, dest);
    copied++;
  }
}

if (copied > 0) {
  console.log(`Copied ${copied} WASM artifact(s) to lib/wasm/`);
} else {
  console.log('No WASM artifacts found in src/wasm/ — skipping copy (run pnpm build:wasm first)');
}
