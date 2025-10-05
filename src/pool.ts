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

import { EventEmitter } from 'node:events';
import { type LZMAOptions, unxzAsync, xzAsync } from './lzma.js';

/**
 * Metrics for pool monitoring
 */
export interface PoolMetrics {
  /** Number of currently active compression/decompression operations */
  active: number;
  /** Number of operations waiting in the queue */
  queued: number;
  /** Total number of successfully completed operations */
  completed: number;
  /** Total number of failed operations */
  failed: number;
}

/**
 * Task in the queue
 */
interface QueuedTask {
  fn: () => Promise<Buffer>;
  resolve: (value: Buffer) => void;
  reject: (error: Error) => void;
}

/**
 * LZMA Pool with concurrency control and event monitoring
 *
 * Provides rate limiting and backpressure for LZMA operations.
 * Emits events for monitoring and metrics collection in production.
 *
 * @example
 * ```typescript
 * const pool = new LZMAPool(10); // Max 10 concurrent operations
 *
 * pool.on('metrics', (metrics) => {
 *   console.log(`Active: ${metrics.active}, Queued: ${metrics.queued}`);
 * });
 *
 * const compressed = await pool.compress(buffer);
 * ```
 *
 * Events:
 * - 'queue': Emitted when task added to queue
 * - 'start': Emitted when task starts processing
 * - 'complete': Emitted when task completes successfully
 * - 'error-task': Emitted when task fails
 * - 'metrics': Emitted after each state change with current metrics
 */
export class LZMAPool extends EventEmitter {
  private queue: QueuedTask[] = [];

  private metrics: PoolMetrics = {
    active: 0,
    queued: 0,
    completed: 0,
    failed: 0,
  };

  /**
   * Create a new LZMA pool
   * @param maxConcurrent Maximum number of concurrent operations (default: 10)
   */
  constructor(private maxConcurrent = 10) {
    super();

    if (maxConcurrent < 1) {
      throw new RangeError('maxConcurrent must be at least 1');
    }
  }

  /**
   * Compress data with automatic queue management
   * @param data Buffer to compress
   * @param opts LZMA compression options
   * @returns Promise that resolves to compressed buffer
   */
  async compress(data: Buffer, opts?: LZMAOptions): Promise<Buffer> {
    return this.enqueue(() => xzAsync(data, opts));
  }

  /**
   * Decompress data with automatic queue management
   * @param data Compressed buffer to decompress
   * @param opts LZMA decompression options
   * @returns Promise that resolves to decompressed buffer
   */
  async decompress(data: Buffer, opts?: LZMAOptions): Promise<Buffer> {
    return this.enqueue(() => unxzAsync(data, opts));
  }

  /**
   * Get current pool metrics
   * @returns Copy of current metrics
   */
  getMetrics(): Readonly<PoolMetrics> {
    return { ...this.metrics };
  }

  /**
   * Get number of tasks waiting in queue
   * @returns Queue length
   */
  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Get number of currently active tasks
   * @returns Active task count
   */
  get activeCount(): number {
    return this.metrics.active;
  }

  /**
   * Check if pool is at maximum capacity
   * @returns True if at capacity
   */
  get isAtCapacity(): boolean {
    return this.metrics.active >= this.maxConcurrent;
  }

  /**
   * Enqueue a task for execution
   * @param fn Task function returning Promise<Buffer>
   * @returns Promise that resolves when task completes
   */
  private async enqueue(fn: () => Promise<Buffer>): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.metrics.queued = this.queue.length;
      this.emit('queue', { ...this.metrics });
      this.processQueue();
    });
  }

  /**
   * Process tasks from queue respecting concurrency limit
   */
  private processQueue(): void {
    // Don't start new tasks if at capacity or queue empty
    if (this.metrics.active >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.metrics.active++;
    this.metrics.queued = this.queue.length;
    this.emit('start', { ...this.metrics });

    // Execute task
    item
      .fn()
      .then((result) => {
        this.metrics.completed++;
        item.resolve(result);
        this.emit('complete', { ...this.metrics });
      })
      .catch((error: Error) => {
        this.metrics.failed++;
        item.reject(error);
        this.emit('error-task', error, { ...this.metrics });
      })
      .finally(() => {
        this.metrics.active--;
        this.emit('metrics', { ...this.metrics });

        // Process next task in queue
        this.processQueue();
      });
  }

  /**
   * Wait for all active tasks to complete
   * Does not process new tasks added while waiting
   * @returns Promise that resolves when all active tasks are done
   */
  async drain(): Promise<void> {
    if (this.metrics.active === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const checkDrained = () => {
        if (this.metrics.active === 0) {
          this.off('metrics', checkDrained);
          resolve();
        }
      };
      this.on('metrics', checkDrained);
    });
  }

  /**
   * Clear all pending tasks from the queue
   * Active tasks will continue to run
   * @returns Number of tasks removed from queue
   */
  clearQueue(): number {
    const cleared = this.queue.length;
    this.queue = [];
    this.metrics.queued = 0;
    this.emit('metrics', { ...this.metrics });
    return cleared;
  }
}
