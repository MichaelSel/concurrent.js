/**
 * p-limit implementation in TypeScript
 * 
 * Limits the number of concurrent executions of promises.
 */

export interface QueuedFunction<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
}

export function pLimit(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('Expected `concurrency` to be a positive integer');
  }

  const queue: Array<QueuedFunction<any>> = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;

    if (queue.length > 0) {
      const item = queue.shift()!;
      run(item);
    }
  };

  const run = async <T>({ fn, resolve, reject }: QueuedFunction<T>) => {
    activeCount++;

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    }

    next();
  };

  /**
   * Adds a function to the execution queue
   * @param fn Function to be executed with limited concurrency
   */
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const queuedFn: QueuedFunction<T> = { fn, resolve, reject };

      if (activeCount < concurrency) {
        run(queuedFn);
      } else {
        queue.push(queuedFn);
      }
    });
  };

  /**
   * Wraps a function to enforce the concurrency limit
   * @param fn Function to be wrapped
   */
  const wrap = <Args extends any[], ReturnType>(
    fn: (...args: Args) => Promise<ReturnType>
  ) => {
    return (...args: Args): Promise<ReturnType> => {
      return enqueue(() => fn(...args));
    };
  };

  return {
    /**
     * Execute a function with limited concurrency
     */
    add: enqueue,
    
    /**
     * Wrap a function to enforce limited concurrency
     */
    wrap,
    
    /**
     * Get the number of active tasks
     */
    activeCount: () => activeCount,
    
    /**
     * Get the number of pending tasks
     */
    pendingCount: () => queue.length,
    
    /**
     * Clear all pending tasks
     */
    clearQueue: () => {
      queue.length = 0;
    }
  };
} 