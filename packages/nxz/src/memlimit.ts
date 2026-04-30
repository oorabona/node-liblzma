/**
 * Parse a SIZE string for --memlimit-decompress.
 *
 * Accepted formats (integer mantissa only — decimals like `1.5MiB` are rejected
 * for parity with the standard `xz` CLI):
 *   - IEC binary suffixes (1024-based): KiB, MiB, GiB, TiB
 *   - SI decimal suffixes (1000-based): KB, MB, GB, TB
 *   - Plain integer bytes
 *
 * All zero forms (`0`, `0MiB`, `0kib`, `max`, `MAX`, etc.) are synonyms for
 * "no limit" → `undefined`. Suffix matching is case-insensitive.
 *
 * Throws TypeError on any unrecognized input, with a message that includes the
 * original input value AND the list of valid formats.
 */
export function parseMemlimitSize(s: string): bigint | undefined {
  if (s === '0' || s.toLowerCase() === 'max') return;

  // IEC binary suffixes (1024-based) — integer mantissa only
  const iec = /^(\d+)\s*(KiB|MiB|GiB|TiB)$/i.exec(s);
  if (iec) {
    const num = iec[1] ?? '';
    const suffix = (iec[2] ?? '').toUpperCase();
    const multipliers: Record<string, bigint> = {
      KIB: BigInt(1024),
      MIB: BigInt(1024 * 1024),
      GIB: BigInt(1024 * 1024 * 1024),
      TIB: BigInt(1024 * 1024 * 1024 * 1024),
    };
    const mult = multipliers[suffix];
    if (mult === undefined) {
      throw new TypeError(`Invalid memory size: "${s}"`);
    }
    const result = BigInt(num) * mult;
    if (result === 0n) return;
    return result;
  }

  // SI decimal suffixes (1000-based) — integer mantissa only
  const si = /^(\d+)\s*(KB|MB|GB|TB)$/i.exec(s);
  if (si) {
    const num = si[1] ?? '';
    const suffix = (si[2] ?? '').toUpperCase();
    const multipliers: Record<string, bigint> = {
      KB: BigInt(1000),
      MB: BigInt(1000 * 1000),
      GB: BigInt(1000 * 1000 * 1000),
      TB: BigInt(1000 * 1000 * 1000 * 1000),
    };
    const mult = multipliers[suffix];
    if (mult === undefined) {
      throw new TypeError(`Invalid memory size: "${s}"`);
    }
    const result = BigInt(num) * mult;
    if (result === 0n) return;
    return result;
  }

  // Plain integer (no suffix)
  if (/^\d+$/.test(s)) {
    return BigInt(s);
  }

  throw new TypeError(
    `Invalid memory size: "${s}". Expected a plain integer (e.g. 268435456), ` +
      `an IEC suffix (e.g. 256MiB, 1GiB), a SI suffix (e.g. 256MB, 1GB), ` +
      `integer mantissa only — or "0"/"max" for no limit.`
  );
}
