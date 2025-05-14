/**
 * Semaphore implementation in TypeScript
 * 
 * A semaphore is a synchronization primitive that can be used to control access
 * to a common resource by multiple threads/processes in a concurrent system.
 */
export class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  /**
   * Creates a new semaphore with the specified number of permits
   * @param permits Initial number of permits available (default: 1)
   */
  constructor(permits = 1) {
    if (permits < 0) {
      throw new Error('Permits must be a non-negative number');
    }
    this.permits = permits;
  }

  /**
   * Acquires a permit, blocking until one is available
   * @returns A promise that resolves when a permit is acquired
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
  }

  /**
   * Releases a permit, potentially unblocking a waiting acquirer
   */
  release(): void {
    const waiter = this.queue.shift();
    if (waiter) {
      waiter();
    } else {
      this.permits++;
    }
  }

  /**
   * Returns the current number of available permits
   */
  getAvailablePermits(): number {
    return this.permits;
  }

  /**
   * Returns the current number of tasks waiting to acquire
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Run a function with semaphore protection
   * @param fn The function to execute with the semaphore acquired
   */
  async withAcquire<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
} 