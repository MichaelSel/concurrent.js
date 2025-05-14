/**
 * Deferred Promise implementation
 * 
 * A Promise with externally accessible resolve and reject methods.
 * Useful for creating promises that need to be resolved or rejected outside 
 * of their creation context.
 */
export class Deferred<T> {
  // The promise that this deferred controls
  private _promise: Promise<T>;
  
  // Resolve and reject functions for the promise
  private _resolve!: (value: T | PromiseLike<T>) => void;
  private _reject!: (reason?: any) => void;
  
  /**
   * Creates a new Deferred object
   */
  constructor() {
    this._promise = new Promise<T>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }
  
  /**
   * The underlying promise
   */
  get promise(): Promise<T> {
    return this._promise;
  }
  
  /**
   * Resolves the promise with the provided value
   */
  resolve(value: T | PromiseLike<T>): void {
    this._resolve(value);
  }
  
  /**
   * Rejects the promise with the provided reason
   */
  reject(reason?: any): void {
    this._reject(reason);
  }
  
  /**
   * Creates a promise that will be resolved after the specified delay
   * @param value The value to resolve with
   * @param delayMs Delay in milliseconds
   * @returns The deferred promise
   */
  static withTimeout<T>(value: T, delayMs: number): Deferred<T> {
    const deferred = new Deferred<T>();
    setTimeout(() => deferred.resolve(value), delayMs);
    return deferred;
  }
  
  /**
   * Creates a deferred promise that can be resolved by another promise
   * @param promise The promise to chain with
   * @returns The deferred promise
   */
  static fromPromise<T>(promise: Promise<T>): Deferred<T> {
    const deferred = new Deferred<T>();
    promise.then(
      value => deferred.resolve(value),
      reason => deferred.reject(reason)
    );
    return deferred;
  }
} 