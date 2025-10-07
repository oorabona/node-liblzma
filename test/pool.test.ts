/**
 * Tests for LZMA Pool with concurrency control and events
 */

import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it } from 'vitest';
import { LZMAPool } from '../src/pool.js';

describe('LZMAPool', () => {
  let pool: LZMAPool;
  const testData = Buffer.from('Test data for compression '.repeat(10));

  beforeEach(() => {
    pool = new LZMAPool(5); // Small pool for testing
  });

  describe('Constructor', () => {
    it('should create pool with default concurrency', () => {
      const defaultPool = new LZMAPool();
      expect(defaultPool.activeCount).toBe(0);
      expect(defaultPool.queueLength).toBe(0);
    });

    it('should create pool with custom concurrency', () => {
      const customPool = new LZMAPool(3);
      expect(customPool.activeCount).toBe(0);
    });

    it('should throw for invalid maxConcurrent', () => {
      expect(() => new LZMAPool(0)).toThrow(RangeError);
      expect(() => new LZMAPool(-1)).toThrow(RangeError);
    });
  });

  describe('Compression operations', () => {
    it('should compress data successfully', async () => {
      const compressed = await pool.compress(testData);
      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeGreaterThan(0);
      expect(compressed.length).toBeLessThan(testData.length);
    });

    it('should decompress data successfully', async () => {
      const compressed = await pool.compress(testData);
      const decompressed = await pool.decompress(compressed);
      expect(decompressed.equals(testData)).toBe(true);
    });

    it('should handle multiple concurrent operations', async () => {
      const operations = Array.from({ length: 10 }, () =>
        pool.compress(Buffer.from('test '.repeat(50)))
      );

      const results = await Promise.all(operations);
      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(Buffer.isBuffer(result)).toBe(true);
      });
    });
  });

  describe('Metrics tracking', () => {
    it('should track metrics correctly', async () => {
      const metrics = pool.getMetrics();
      expect(metrics.active).toBe(0);
      expect(metrics.queued).toBe(0);
      expect(metrics.completed).toBe(0);
      expect(metrics.failed).toBe(0);
    });

    it('should update completed count', async () => {
      await pool.compress(testData);
      const metrics = pool.getMetrics();
      expect(metrics.completed).toBe(1);
    });

    it('should track multiple operations', async () => {
      await pool.compress(testData);
      await pool.compress(testData);
      await pool.compress(testData);

      const metrics = pool.getMetrics();
      expect(metrics.completed).toBe(3);
    });

    it('should return readonly copy of metrics', () => {
      const metrics1 = pool.getMetrics();
      const metrics2 = pool.getMetrics();
      expect(metrics1).not.toBe(metrics2);
      expect(metrics1).toEqual(metrics2);
    });
  });

  describe('Queue management', () => {
    it('should queue operations when at capacity', async () => {
      const smallPool = new LZMAPool(2);
      const operations = Array.from({ length: 10 }, () =>
        smallPool.compress(Buffer.from('x'.repeat(100)))
      );

      // Should queue some operations
      await new Promise((resolve) => setImmediate(resolve));
      expect(smallPool.queueLength + smallPool.activeCount).toBeGreaterThanOrEqual(1);

      await Promise.all(operations);
    });

    it('should process queued operations after active ones complete', async () => {
      const operations = Array.from({ length: 15 }, () => pool.compress(Buffer.from('test')));

      await Promise.all(operations);
      expect(pool.queueLength).toBe(0);
      expect(pool.activeCount).toBe(0);
    });

    it('should report correct capacity status', async () => {
      const smallPool = new LZMAPool(2);

      // Empty pool
      expect(smallPool.isAtCapacity).toBe(false);

      // Start filling pool
      const operations = Array.from({ length: 8 }, () =>
        smallPool.compress(Buffer.from('test '.repeat(50)))
      );

      // Give time for some to start
      await new Promise((resolve) => setImmediate(resolve));

      // Pool should be at capacity at some point
      // (either active or queued)
      expect(smallPool.activeCount + smallPool.queueLength).toBeGreaterThan(2);

      await Promise.all(operations);
    });
  });

  describe('Event emission', () => {
    it('should emit queue event when task added', () => {
      return new Promise<void>((resolve) => {
        pool.on('queue', (metrics) => {
          expect(metrics.queued).toBeGreaterThan(0);
          resolve();
        });

        pool.compress(testData);
      });
    });

    it('should emit start event when task begins', () => {
      return new Promise<void>((resolve) => {
        pool.on('start', (metrics) => {
          expect(metrics.active).toBeGreaterThan(0);
          resolve();
        });

        pool.compress(testData);
      });
    });

    it('should emit complete event when task finishes', () => {
      return new Promise<void>((resolve) => {
        pool.on('complete', (metrics) => {
          expect(metrics.completed).toBeGreaterThan(0);
          resolve();
        });

        pool.compress(testData);
      });
    });

    it('should emit metrics event after state changes', () => {
      return new Promise<void>((resolve) => {
        let emitCount = 0;
        pool.on('metrics', () => {
          emitCount++;
          if (emitCount > 0) {
            resolve();
          }
        });

        pool.compress(testData);
      });
    });

    it('should emit error-task event on failure', () => {
      return new Promise<void>((resolve) => {
        const badPool = new LZMAPool(1);

        badPool.on('error-task', (error, metrics) => {
          expect(error).toBeInstanceOf(Error);
          expect(metrics.failed).toBeGreaterThan(0);
          resolve();
        });

        // Try to decompress invalid data
        badPool.decompress(Buffer.from('not compressed data')).catch(() => {
          // Expected to fail
        });
      });
    });
  });

  describe('Drain functionality', () => {
    it('should resolve immediately when no active tasks', async () => {
      await pool.drain();
      expect(pool.activeCount).toBe(0);
    });

    it('should wait for active tasks to complete', async () => {
      const promises = Array.from({ length: 5 }, () =>
        pool.compress(Buffer.from('x'.repeat(1000)))
      );

      const drainPromise = pool.drain();
      await Promise.all(promises);
      await drainPromise;

      expect(pool.activeCount).toBe(0);
    });
  });

  describe('Clear queue', () => {
    it('should clear all pending tasks', () => {
      // Add many tasks to create a queue
      for (let i = 0; i < 20; i++) {
        pool.compress(Buffer.from('test'));
      }

      const cleared = pool.clearQueue();
      expect(cleared).toBeGreaterThan(0);
      expect(pool.queueLength).toBe(0);
    });

    it('should return 0 when queue is empty', () => {
      const cleared = pool.clearQueue();
      expect(cleared).toBe(0);
    });

    it('should not affect active tasks', async () => {
      // Start some tasks
      const activeTask = pool.compress(testData);

      // Try to clear (nothing to clear if no queue)
      pool.clearQueue();

      // Active task should still complete
      const result = await activeTask;
      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });

  describe('Concurrency control', () => {
    it('should respect maxConcurrent limit', async () => {
      const pool3 = new LZMAPool(3);
      let maxActive = 0;

      pool3.on('metrics', (metrics) => {
        if (metrics.active > maxActive) {
          maxActive = metrics.active;
        }
      });

      // Add more tasks than max concurrent
      const operations = Array.from({ length: 10 }, () =>
        pool3.compress(Buffer.from('x'.repeat(100)))
      );

      await Promise.all(operations);

      // Max active should never exceed limit
      expect(maxActive).toBeLessThanOrEqual(3);
      expect(maxActive).toBeGreaterThan(0);
    });

    it('should process all tasks eventually', async () => {
      const count = 25;
      const operations = Array.from({ length: count }, () => pool.compress(Buffer.from('test')));

      await Promise.all(operations);

      const metrics = pool.getMetrics();
      expect(metrics.completed).toBe(count);
      expect(metrics.active).toBe(0);
      expect(metrics.queued).toBe(0);
    });
  });

  describe('Error handling', () => {
    it('should track failed operations', async () => {
      try {
        await pool.decompress(Buffer.from('invalid xz data'));
      } catch {
        // Expected
      }

      const metrics = pool.getMetrics();
      expect(metrics.failed).toBeGreaterThan(0);
    });

    it('should continue processing after error', async () => {
      // Do two valid operations first
      await pool.compress(testData);
      await pool.compress(testData);

      let errorCaught = false;
      try {
        // Try invalid decompression
        await pool.decompress(Buffer.from('this is not xz compressed data'));
      } catch {
        errorCaught = true;
      }

      expect(errorCaught).toBe(true);

      // Should still be able to do valid operations
      const result = await pool.compress(testData);
      expect(Buffer.isBuffer(result)).toBe(true);

      const metrics = pool.getMetrics();
      expect(metrics.completed).toBeGreaterThan(0);
    });
  });
});
