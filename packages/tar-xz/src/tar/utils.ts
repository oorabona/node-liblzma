/**
 * Strip leading path components from a path
 */
export function stripPath(filePath: string, strip: number): string {
  if (strip <= 0) {
    return filePath;
  }

  const parts = filePath.split('/');
  return parts.slice(strip).join('/');
}
