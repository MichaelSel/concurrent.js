/**
 * PromiseWithTimeout implementation
 * 
 * Provides utilities for working with promise timeouts.
 */
export class PromiseWithTimeout {
  /**
   * Creates a promise that rejects after the specified timeout
   * @param ms Timeout duration in milliseconds
   * @param reason Optional custom error message
   * @returns A promise that rejects after the timeout
   */
  static createTimeout(ms: number, reason: string = `Operation timed out after ${ms}ms`): Promise<never> {
    return new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(reason)), ms);
    });
  }

  /**
   * Wraps a promise with a timeout, rejecting if the original promise
   * doesn't settle within the specified time
   * @param promise The promise to wrap with a timeout
   * @param timeoutMs Timeout duration in milliseconds
   * @param reason Optional custom error message
   * @returns A promise that resolves with the original result or rejects on timeout
   */
  static withTimeout<T>(
    promise: Promise<T>, 
    timeoutMs: number,
    reason?: string
  ): Promise<T> {
    const timeoutPromise = this.createTimeout(timeoutMs, reason);
    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Executes an async function with a timeout
   * @param fn The async function to execute
   * @param timeoutMs Timeout duration in milliseconds
   * @param args Arguments to pass to the function
   * @returns A promise that resolves with the function result or rejects on timeout
   */
  static async execute<T, Args extends any[]>(
    fn: (...args: Args) => Promise<T>,
    timeoutMs: number,
    ...args: Args
  ): Promise<T> {
    return this.withTimeout(fn(...args), timeoutMs);
  }

  /**
   * Creates a wrapper function that applies a timeout to the original function
   * @param fn The function to wrap with a timeout
   * @param timeoutMs Timeout duration in milliseconds
   * @returns A function that returns a promise with a timeout
   */
  static createTimeoutWrapper<T, Args extends any[]>(
    fn: (...args: Args) => Promise<T>,
    timeoutMs: number
  ): (...args: Args) => Promise<T> {
    return (...args: Args) => this.execute(fn, timeoutMs, ...args);
  }
} 