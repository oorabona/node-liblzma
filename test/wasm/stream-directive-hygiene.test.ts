import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Forward-compat guard for `src/wasm/stream.ts`.
 *
 * `@types/node` adds and (more rarely) removes typed members of the Streams
 * interfaces across minor bumps. The file deliberately uses an intersection
 * cast on `TransformStream` constructor calls so it needs ZERO TypeScript
 * suppression directives. Any directive — in either the expect-error or
 * ignore form — would either mask a real upstream regression, or fire
 * TS2578 ("unused directive") the moment the typing it suppresses lands
 * upstream, breaking the daily Refresh Lockfile workflow.
 *
 * This test is the deterministic regression detector for that invariant.
 */
describe('src/wasm/stream.ts — TS directive hygiene', () => {
  it('contains no @ts-ignore or @ts-expect-error directive', () => {
    const path = fileURLToPath(new URL('../../src/wasm/stream.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');

    // Match the directive form specifically (with leading `//` and a word boundary
    // after the directive name), so the rule name appearing inside a doc-comment
    // or string literal does not produce a false positive.
    const directivePattern = /\/\/\s*@ts-(expect-error|ignore)\b/;
    expect(source).not.toMatch(directivePattern);
  });
});
