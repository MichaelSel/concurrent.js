/**
 * Sliding Window Rate Limiter implementation
 * 
 * A more precise version of the fixed window algorithm that takes into
 * account a weighted value of the previous window to smooth out bursts
 * that might occur near the boundaries of windows.
 */
import { AbstractRateLimiter } from './RateLimiter';

interface SlidingWindowState {
  currentWindow: {
    timestamp: number;
    count: number;
  };
  previousWindow: {
    timestamp: number;
    count: number;
  };
}

export class SlidingWindowRateLimiter extends AbstractRateLimiter {
  /**
   * Creates a new Sliding Window Rate Limiter
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
    
    // Calculate current rate using the sliding window formula
    const currentRate = this.calculateCurrentRate(state, now);
    
    // Check if acquiring the tokens would exceed the capacity
    if (currentRate + tokens > this.capacity) {
      return false;
    }
    
    // Acquire the tokens
    state.currentWindow.count += tokens;
    this.storageMap.set(key, state);
    
    return true;
  }
  
  /**
   * Gets the number of remaining tokens for a key
   * @param key Optional key to partition rate limiting (default: 'default')
   * @returns Number of remaining tokens
   */
  getRemainingTokens(key: string = 'default'): number {
    const now = Date.now();
    const state = this.getCurrentState(key, now);
    const currentRate = this.calculateCurrentRate(state, now);
    
    return Math.max(0, this.capacity - currentRate);
  }
  
  /**
   * Gets the current state for a key, creating or updating it if necessary
   * @param key The key to get state for
   * @param now Current timestamp
   * @returns The current state
   */
  private getCurrentState(key: string, now: number): SlidingWindowState {
    let state = this.storageMap.get(key) as SlidingWindowState;
    
    // Initialize state if it doesn't exist
    if (!state) {
      state = {
        currentWindow: {
          timestamp: this.getWindowStart(now),
          count: 0
        },
        previousWindow: {
          timestamp: this.getWindowStart(now) - this.window,
          count: 0
        }
      };
    }
    
    const currentWindowStart = this.getWindowStart(now);
    
    // If we've moved to a new window
    if (currentWindowStart > state.currentWindow.timestamp) {
      // The previous window is now the old current window
      state.previousWindow = {
        timestamp: state.currentWindow.timestamp,
        count: state.currentWindow.count
      };
      
      // And we start with a fresh current window
      state.currentWindow = {
        timestamp: currentWindowStart,
        count: 0
      };
    }
    
    // We only keep track of one previous window, so if more time has passed, reset it
    if (now - state.previousWindow.timestamp >= 2 * this.window) {
      state.previousWindow = {
        timestamp: currentWindowStart - this.window,
        count: 0
      };
    }
    
    this.storageMap.set(key, state);
    return state;
  }
  
  /**
   * Calculates the current rate accounting for the weighted contribution of the previous window
   * @param state The current state
   * @param now Current timestamp
   * @returns The current rate
   */
  private calculateCurrentRate(state: SlidingWindowState, now: number): number {
    const currentWindowProgress = (now - state.currentWindow.timestamp) / this.window;
    const previousWindowWeight = Math.max(0, 1 - currentWindowProgress);
    
    // The current rate is the count in the current window plus a weighted portion of the previous window
    const weightedPreviousCount = state.previousWindow.count * previousWindowWeight;
    return state.currentWindow.count + weightedPreviousCount;
  }
  
  /**
   * Gets the start time of the window containing the given timestamp
   * @param timestamp The timestamp
   * @returns The window start time
   */
  private getWindowStart(timestamp: number): number {
    return Math.floor(timestamp / this.window) * this.window;
  }
} 