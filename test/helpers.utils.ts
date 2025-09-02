// Tests helper functions
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';

export function random(howMany: number, chars?: string): string {
  const characters = chars || 'abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUWXYZ0123456789';
  const rnd = crypto.randomBytes(howMany);
  const value = new Array(howMany);
  const len = characters.length;

  for (let i = 0; i < howMany; i++) {
    value[i] = characters[rnd[i] % len];
  }

  return value.join('');
}

export function checkOutputFile(file: string, size: number): string | null {
  const stat = fs.statSync(file);
  return stat.size === size ? null : `Size is different: ${stat.size}`;
}

export function bufferEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}
