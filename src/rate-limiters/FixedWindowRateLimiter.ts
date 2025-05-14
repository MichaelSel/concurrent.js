/**
 * Fixed Window Rate Limiter implementation
 * 
 * Limits operations to a maximum number within fixed time windows.
 * For example, 100 operations per 60 seconds, with the window
 * resetting exactly at the start of each minute.
 */
import { AbstractRateLimiter } from './RateLimiter';

interface FixedWindowState {
  windowStart: number;
  count: number;
}

export class FixedWindowRateLimiter extends AbstractRateLimiter {
  /**
   * Creates a new Fixed Window Rate Limiter
   * @param capacity Maximum number of operations allowed per window
   * @param windowMs Time window in milliseconds
   */
  constructor(capacity: number, windowMs: number) {
    super(capacity, windowMs);
  }

  /**
   * Acquires tokens if possible under the rate limit
   * @param key Optional key to partition rate limiting (default: 'default')
   * @param tokens Number of tokens to acquire (default: 1)
   * @returns Whether the tokens were successfully acquired
   */
  tryAcquire(key: string = 'default', tokens: number = 1): boolean {
    if (tokens <= 0) {
      throw new Error('Tokens must be a positive number');
    }
    
    const now = Date.now();
    const state = this.getCurrentState(key, now);
    
    // Check if acquiring the tokens would exceed the capacity
    if (state.count + tokens > this.capacity) {
      return false;
    }
    
    // Acquire the tokens
    state.count += tokens;
    this.storageMap.set(key, state);
    
    return true;
  }
  
  /**
   * Gets the number of remaining tokens for a key
   * @param key Optional key to partition rate limiting (default: 'default')
   * @returns Number of remaining tokens
   */
  getRemainingTokens(key: string = 'default'): number {
    const state = this.getCurrentState(key, Date.now());
    return Math.max(0, this.capacity - state.count);
  }
  
  /**
   * Gets the current state for a key, creating it if necessary
   * @param key The key to get state for
   * @param now Current timestamp
   * @returns The current state
   */
  private getCurrentState(key: string, now: number): FixedWindowState {
    let state = this.storageMap.get(key) as FixedWindowState;
    
    // Initialize state if it doesn't exist
    if (!state) {
      state = {
        windowStart: this.getWindowStart(now),
        count: 0
      };
      this.storageMap.set(key, state);
    }
    
    // Check if the window has expired and we need to start a new one
    const currentWindowStart = this.getWindowStart(now);
    if (currentWindowStart > state.windowStart) {
      state.windowStart = currentWindowStart;
      state.count = 0;
    }
    
    return state;
  }
  
  /**
   * Gets the start time of the window containing the given timestamp
   * @param timestamp The timestamp
   * @returns The window start time
   */
  private getWindowStart(timestamp: number): number {
    return Math.floor(timestamp / this.window) * this.window;
  }
  
  /**
   * Gets the remaining time in milliseconds until the current window resets
   * @param key Optional key to partition rate limiting (default: 'default')
   * @returns Milliseconds until window reset
   */
  getTimeToNextReset(key: string = 'default'): number {
    const now = Date.now();
    const state = this.getCurrentState(key, now);
    return state.windowStart + this.window - now;
  }
} 