/**
 * Unit tests for parseMemlimitSize — covers the parser contract directly
 * without going through the CLI binary. All edge-cases from the review findings.
 */
import { describe, expect, it } from 'vitest';
import { parseMemlimitSize } from '../src/nxz.ts';

// ---------------------------------------------------------------------------
// Zero / no-limit forms — all must return undefined
// ---------------------------------------------------------------------------
describe('parseMemlimitSize — zero / no-limit forms return undefined', () => {
  it('"0" (bare zero) → undefined', () => {
    expect(parseMemlimitSize('0')).toBeUndefined();
  });

  it('"0MiB" (IEC zero) → undefined', () => {
    expect(parseMemlimitSize('0MiB')).toBeUndefined();
  });

  it('"0KB" (SI zero) → undefined', () => {
    expect(parseMemlimitSize('0KB')).toBeUndefined();
  });

  it('"0kib" (IEC zero, lower-case suffix) → undefined', () => {
    expect(parseMemlimitSize('0kib')).toBeUndefined();
  });

  it('"max" (lower-case) → undefined', () => {
    expect(parseMemlimitSize('max')).toBeUndefined();
  });

  it('"MAX" (upper-case) → undefined', () => {
    expect(parseMemlimitSize('MAX')).toBeUndefined();
  });

  it('"Max" (mixed-case) → undefined', () => {
    expect(parseMemlimitSize('Max')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Normal valid inputs
// ---------------------------------------------------------------------------
describe('parseMemlimitSize — valid inputs', () => {
  it('"256MiB" → 268435456n', () => {
    expect(parseMemlimitSize('256MiB')).toBe(268435456n);
  });

  it('"1GiB" → 1073741824n', () => {
    expect(parseMemlimitSize('1GiB')).toBe(1073741824n);
  });

  it('"512KiB" → 524288n', () => {
    expect(parseMemlimitSize('512KiB')).toBe(524288n);
  });

  it('"1TiB" → 1099511627776n', () => {
    expect(parseMemlimitSize('1TiB')).toBe(1099511627776n);
  });

  it('"256MB" (SI) → 256000000n', () => {
    expect(parseMemlimitSize('256MB')).toBe(256000000n);
  });

  it('"1GB" (SI) → 1000000000n', () => {
    expect(parseMemlimitSize('1GB')).toBe(1000000000n);
  });

  it('"268435456" (plain integer) → 268435456n', () => {
    expect(parseMemlimitSize('268435456')).toBe(268435456n);
  });

  it('"1" (minimum plain integer) → 1n', () => {
    expect(parseMemlimitSize('1')).toBe(1n);
  });
});

// ---------------------------------------------------------------------------
// Mixed-case suffix — case-insensitive, must accept
// ---------------------------------------------------------------------------
describe('parseMemlimitSize — mixed-case suffix accepted', () => {
  it('"256mib" (lower-case IEC) → 268435456n', () => {
    expect(parseMemlimitSize('256mib')).toBe(268435456n);
  });

  it('"256MIB" (upper-case IEC) → 268435456n', () => {
    expect(parseMemlimitSize('256MIB')).toBe(268435456n);
  });

  it('"256mb" (lower-case SI) → 256000000n', () => {
    expect(parseMemlimitSize('256mb')).toBe(256000000n);
  });
});

// ---------------------------------------------------------------------------
// Whitespace between number and suffix — regex uses \s*, must accept
// ---------------------------------------------------------------------------
describe('parseMemlimitSize — whitespace between number and suffix', () => {
  it('"256 MiB" (space before suffix) → 268435456n', () => {
    expect(parseMemlimitSize('256 MiB')).toBe(268435456n);
  });
});

// ---------------------------------------------------------------------------
// Decimal mantissa — REJECTED (S-1 fix)
// ---------------------------------------------------------------------------
describe('parseMemlimitSize — decimal mantissa rejected (S-1)', () => {
  it('"1.5MiB" throws TypeError', () => {
    expect(() => parseMemlimitSize('1.5MiB')).toThrow(TypeError);
  });

  it('"1.0KiB" throws TypeError', () => {
    expect(() => parseMemlimitSize('1.0KiB')).toThrow(TypeError);
  });

  it('"3.14GB" throws TypeError', () => {
    expect(() => parseMemlimitSize('3.14GB')).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// Negative / invalid inputs — must throw TypeError
// ---------------------------------------------------------------------------
describe('parseMemlimitSize — invalid inputs throw TypeError', () => {
  it('"" (empty string) throws TypeError', () => {
    expect(() => parseMemlimitSize('')).toThrow(TypeError);
  });

  it('"-1" (negative bare integer) throws TypeError', () => {
    expect(() => parseMemlimitSize('-1')).toThrow(TypeError);
  });

  it('"-1MiB" (negative with IEC suffix) throws TypeError', () => {
    expect(() => parseMemlimitSize('-1MiB')).toThrow(TypeError);
  });

  it('"badinput" throws TypeError', () => {
    expect(() => parseMemlimitSize('badinput')).toThrow(TypeError);
  });

  it('" 256MiB" (leading whitespace) throws TypeError — anchored ^ rejects', () => {
    expect(() => parseMemlimitSize(' 256MiB')).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// Boundary / precision — parser-level only (upstream validateMemlimit handles UINT64_MAX)
// ---------------------------------------------------------------------------
describe('parseMemlimitSize — boundary values (parser-level)', () => {
  it('UINT64_MAX "18446744073709551615" passes parser → 18446744073709551615n', () => {
    expect(parseMemlimitSize('18446744073709551615')).toBe(18446744073709551615n);
  });

  it('arbitrary large integer "99999999999999999999999999999" passes parser exactly', () => {
    expect(parseMemlimitSize('99999999999999999999999999999')).toBe(99999999999999999999999999999n);
  });
});
