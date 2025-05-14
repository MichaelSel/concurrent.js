/**
 * Mutex implementation in TypeScript
 * 
 * A mutex is a synchronization primitive that grants exclusive access
 * to a shared resource. It is essentially a binary semaphore (permits=1).
 */
export class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  /**
   * Acquires the mutex, blocking until it is available
   * @returns A promise that resolves when the mutex is acquired
   */
  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve();
    }

    return new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
  }

  /**
   * Releases the mutex, allowing another waiting acquirer to proceed
   */
  release(): void {
    const waiter = this.queue.shift();
    if (waiter) {
      waiter();
    } else {
      this.locked = false;
    }
  }

  /**
   * Checks if the mutex is currently locked
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Returns the current number of waiters
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Run a function with mutex protection
   * @param fn The function to execute with the mutex acquired
   */
  async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
} 