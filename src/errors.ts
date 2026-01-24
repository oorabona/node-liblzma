/**
 * node-liblzma - Node.js bindings for liblzma
 * Copyright (C) Olivier Orabona <olivier.orabona@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Base class for all LZMA-related errors
 */
export class LZMAError extends Error {
  public readonly errno: number;
  public readonly code: number;

  constructor(message: string, errno: number) {
    super(message);
    this.name = 'LZMAError';
    this.errno = errno;
    this.code = errno;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Memory allocation error - thrown when LZMA cannot allocate required memory
 */
export class LZMAMemoryError extends LZMAError {
  constructor(errno: number) {
    super('Cannot allocate memory', errno);
    this.name = 'LZMAMemoryError';
  }
}

/**
 * Memory limit error - thrown when operation would exceed memory usage limit
 */
export class LZMAMemoryLimitError extends LZMAError {
  constructor(errno: number) {
    super('Memory usage limit was reached', errno);
    this.name = 'LZMAMemoryLimitError';
  }
}

/**
 * Format error - thrown when file format is not recognized
 */
export class LZMAFormatError extends LZMAError {
  constructor(errno: number) {
    super('File format not recognized', errno);
    this.name = 'LZMAFormatError';
  }
}

/**
 * Options error - thrown when invalid or unsupported options are provided
 */
export class LZMAOptionsError extends LZMAError {
  constructor(errno: number) {
    super('Invalid or unsupported options', errno);
    this.name = 'LZMAOptionsError';
  }
}

/**
 * Data error - thrown when compressed data is corrupt
 */
export class LZMADataError extends LZMAError {
  constructor(errno: number) {
    super('Data is corrupt', errno);
    this.name = 'LZMADataError';
  }
}

/**
 * Buffer error - thrown when no progress is possible (e.g., buffer too small)
 */
export class LZMABufferError extends LZMAError {
  constructor(errno: number) {
    super('No progress is possible', errno);
    this.name = 'LZMABufferError';
  }
}

/**
 * Programming error - thrown when there's an internal programming error
 */
export class LZMAProgrammingError extends LZMAError {
  constructor(errno: number) {
    super('Programming error', errno);
    this.name = 'LZMAProgrammingError';
  }
}

/**
 * Factory function to create appropriate error instance based on errno
 */
export function createLZMAError(errno: number, message?: string): LZMAError {
  // LZMA return codes mapping from liblzma/base.h:
  // Codes 0-4 are success/informational status codes, not errors.
  // They are handled by the default case below.
  /* biome-ignore lint/correctness/noUnusedVariables: Kept for documentation - shows full lzma_ret enum range (0-11) */
  const LZMA_OK = 0; // Operation completed successfully
  /* biome-ignore lint/correctness/noUnusedVariables: Kept for documentation */
  const LZMA_STREAM_END = 1; // End of stream reached
  /* biome-ignore lint/correctness/noUnusedVariables: Kept for documentation */
  const LZMA_NO_CHECK = 2; // Input stream has no integrity check
  /* biome-ignore lint/correctness/noUnusedVariables: Kept for documentation */
  const LZMA_UNSUPPORTED_CHECK = 3; // Cannot calculate integrity check
  /* biome-ignore lint/correctness/noUnusedVariables: Kept for documentation */
  const LZMA_GET_CHECK = 4; // Integrity check type now available

  // Actual error codes (5-11) - these get specialized error classes:
  const LZMA_MEM_ERROR = 5; // Cannot allocate memory
  const LZMA_MEMLIMIT_ERROR = 6; // Memory usage limit reached
  const LZMA_FORMAT_ERROR = 7; // File format not recognized
  const LZMA_OPTIONS_ERROR = 8; // Invalid or unsupported options
  const LZMA_DATA_ERROR = 9; // Data is corrupt
  const LZMA_BUF_ERROR = 10; // No progress possible
  const LZMA_PROG_ERROR = 11; // Programming error

  switch (errno) {
    case LZMA_MEM_ERROR:
      return new LZMAMemoryError(errno);
    case LZMA_MEMLIMIT_ERROR:
      return new LZMAMemoryLimitError(errno);
    case LZMA_FORMAT_ERROR:
      return new LZMAFormatError(errno);
    case LZMA_OPTIONS_ERROR:
      return new LZMAOptionsError(errno);
    case LZMA_DATA_ERROR:
      return new LZMADataError(errno);
    case LZMA_BUF_ERROR:
      return new LZMABufferError(errno);
    case LZMA_PROG_ERROR:
      return new LZMAProgrammingError(errno);
    default: {
      // For success codes and unknown errors, use base LZMAError
      const errorMessage = message || getErrorMessage(errno);
      return new LZMAError(errorMessage, errno);
    }
  }
}

/**
 * Get error message for a given errno
 */
function getErrorMessage(errno: number): string {
  const messages = [
    'Operation completed successfully',
    'End of stream was reached',
    'Input stream has no integrity check',
    'Cannot calculate the integrity check',
    'Integrity check type is not available',
    'Cannot allocate memory',
    'Memory usage limit was reached',
    'File format not recognized',
    'Invalid or unsupported options',
    'Data is corrupt',
    'No progress is possible',
    'Programming error',
  ];

  // F-011: Handle out-of-bounds errno explicitly instead of silent clamping
  if (errno < 0 || errno >= messages.length) {
    return `Unknown LZMA error code: ${errno}`;
  }
  return messages[errno];
}
