/**
 * Rate limiter interface that all rate limiter implementations should implement
 */
export interface RateLimiter {
  /**
   * Check if the operation can be allowed based on the rate limiting strategy
   * @param key Optional key to identify the client (for partitioning)
   * @returns Whether the operation is allowed
   */
  isAllowed(key?: string): boolean;
  
  /**
   * Acquire tokens and check if the operation can be allowed
   * If allowed, the tokens are consumed
   * @param key Optional key to identify the client (for partitioning)
   * @param tokens Number of tokens to consume (default: 1)
   * @returns Whether the operation is allowed
   */
  tryAcquire(key?: string, tokens?: number): boolean;
  
  /**
   * Check current rate limit status
   * @param key Optional key to identify the client (for partitioning)
   * @returns The remaining tokens or capacity
   */
  getRemainingTokens(key?: string): number;
}

/**
 * Abstract rate limiter class that provides common functionality
 */
export abstract class AbstractRateLimiter implements RateLimiter {
  protected readonly capacity: number;
  protected readonly window: number;  // time window in milliseconds
  protected storageMap: Map<string, any> = new Map();
  
  /**
   * Creates a new rate limiter
   * @param capacity Maximum number of operations allowed in the time window
   * @param windowMs Time window in milliseconds
   */
  constructor(capacity: number, windowMs: number) {
    if (capacity <= 0) {
      throw new Error('Capacity must be a positive number');
    }
    if (windowMs <= 0) {
      throw new Error('Window must be a positive number');
    }
    
    this.capacity = capacity;
    this.window = windowMs;
  }
  
  /**
   * Default implementation for isAllowed
   * @param key Optional key to identify the client
   * @returns Whether the operation is allowed
   */
  isAllowed(key: string = 'default'): boolean {
    return this.getRemainingTokens(key) > 0;
  }
  
  /**
   * Default implementation for tryAcquire
   * Specific rate limiters should override this method
   * @param key Optional key to identify the client
   * @param tokens Number of tokens to consume (default: 1)
   * @returns Whether the operation is allowed
   */
  abstract tryAcquire(key?: string, tokens?: number): boolean;
  
  /**
   * Default implementation for getRemainingTokens
   * Specific rate limiters should override this method
   * @param key Optional key to identify the client
   * @returns The remaining tokens or capacity
   */
  abstract getRemainingTokens(key?: string): number;
  
  /**
   * Reset rate limiting state for a specific key
   * @param key Key to reset
   */
  reset(key: string = 'default'): void {
    this.storageMap.delete(key);
  }
  
  /**
   * Reset rate limiting state for all keys
   */
  resetAll(): void {
    this.storageMap.clear();
  }
} 