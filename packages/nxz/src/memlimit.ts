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
const IEC_REGEX = /^(\d+)\s*(KiB|MiB|GiB|TiB)$/i;
const IEC_MULTIPLIERS: Record<string, bigint> = {
  KIB: BigInt(1024),
  MIB: BigInt(1024 * 1024),
  GIB: BigInt(1024 * 1024 * 1024),
  TIB: BigInt(1024 * 1024 * 1024 * 1024),
};

const SI_REGEX = /^(\d+)\s*(KB|MB|GB|TB)$/i;
const SI_MULTIPLIERS: Record<string, bigint> = {
  KB: BigInt(1000),
  MB: BigInt(1000 * 1000),
  GB: BigInt(1000 * 1000 * 1000),
  TB: BigInt(1000 * 1000 * 1000 * 1000),
};

function isZeroSynonym(s: string): boolean {
  return s === '0' || s.toLowerCase() === 'max';
}

function parseSuffixed(
  s: string,
  regex: RegExp,
  multipliers: Record<string, bigint>
): bigint | null {
  const match = regex.exec(s);
  if (!match) return null;
  const num = match[1] ?? '';
  const suffix = (match[2] ?? '').toUpperCase();
  const mult = multipliers[suffix];
  if (mult === undefined) return null;
  return BigInt(num) * mult;
}

function parsePlainBytes(s: string): bigint | null {
  return /^\d+$/.test(s) ? BigInt(s) : null;
}

export function parseMemlimitSize(s: string): bigint | undefined {
  if (isZeroSynonym(s)) return;

  const result =
    parseSuffixed(s, IEC_REGEX, IEC_MULTIPLIERS) ??
    parseSuffixed(s, SI_REGEX, SI_MULTIPLIERS) ??
    parsePlainBytes(s);

  if (result === null) {
    throw new TypeError(
      `Invalid memory size: "${s}". Expected a plain integer (e.g. 268435456), ` +
        `an IEC suffix (e.g. 256MiB, 1GiB), a SI suffix (e.g. 256MB, 1GB), ` +
        `integer mantissa only — or "0"/"max" for no limit.`
    );
  }

  return result === 0n ? undefined : result;
}
