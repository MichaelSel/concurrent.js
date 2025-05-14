/**
 * Token Bucket Rate Limiter implementation
 * 
 * A token bucket is a container that has a capacity and tokens are added to it at a 
 * fixed rate. When a request arrives, it takes a token from the bucket and if the 
 * bucket is empty, the request is denied. This allows for bursts of traffic as long
 * as the average rate over time does not exceed the specified rate.
 */
import { AbstractRateLimiter } from './RateLimiter';

interface TokenBucketState {
  tokens: number;        // Current tokens in the bucket
  lastRefill: number;    // Timestamp of the last refill
}

export class TokenBucketRateLimiter extends AbstractRateLimiter {
  private readonly refillRate: number;  // Tokens per millisecond
  
  /**
   * Creates a new Token Bucket Rate Limiter
   * @param capacity Maximum number of tokens the bucket can hold (bucket size)
   * @param refillRatePerSecond Rate at which tokens are added to the bucket (tokens per second)
   */
  constructor(capacity: number, refillRatePerSecond: number) {
    // The window parameter is not used in the same way as other rate limiters,
    // we pass 1000 (milliseconds) as a placeholder
    super(capacity, 1000);
    
    if (refillRatePerSecond <= 0) {
      throw new Error('Refill rate must be a positive number');
    }
    
    // Convert to tokens per millisecond for internal calculations
    this.refillRate = refillRatePerSecond / 1000;
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
    const state = this.refillTokens(key, now);
    
    // Check if there are enough tokens in the bucket
    if (state.tokens < tokens) {
      return false;
    }
    
    // Acquire the tokens
    state.tokens -= tokens;
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
    const state = this.refillTokens(key, now);
    return state.tokens;
  }
  
  /**
   * Refills the token bucket based on elapsed time
   * @param key The key to refill tokens for
   * @param now Current timestamp
   * @returns The updated state
   */
  private refillTokens(key: string, now: number): TokenBucketState {
    let state = this.storageMap.get(key) as TokenBucketState;
    
    // Initialize state if it doesn't exist
    if (!state) {
      state = {
        tokens: this.capacity,  // Start with a full bucket
        lastRefill: now
      };
      this.storageMap.set(key, state);
      return state;
    }
    
    // Calculate elapsed time since last refill
    const elapsedTime = now - state.lastRefill;
    
    if (elapsedTime > 0) {
      // Calculate tokens to add based on elapsed time and refill rate
      const tokensToAdd = elapsedTime * this.refillRate;
      
      // Add tokens, but don't exceed capacity
      state.tokens = Math.min(this.capacity, state.tokens + tokensToAdd);
      state.lastRefill = now;
      
      this.storageMap.set(key, state);
    }
    
    return state;
  }
  
  /**
   * Gets the time in milliseconds until the bucket has the specified number of tokens
   * @param key Optional key to partition rate limiting (default: 'default')
   * @param tokens Number of tokens needed (default: 1)
   * @returns Time in milliseconds until tokens are available
   */
  getTimeUntilTokensAvailable(key: string = 'default', tokens: number = 1): number {
    if (tokens <= 0) {
      throw new Error('Tokens must be a positive number');
    }
    
    if (tokens > this.capacity) {
      throw new Error(`Requested tokens (${tokens}) exceed bucket capacity (${this.capacity})`);
    }
    
    const now = Date.now();
    const state = this.refillTokens(key, now);
    
    // If we already have enough tokens, return 0
    if (state.tokens >= tokens) {
      return 0;
    }
    
    // Calculate how many more tokens we need
    const tokensNeeded = tokens - state.tokens;
    
    // Calculate time to generate those tokens at the current refill rate
    return Math.ceil(tokensNeeded / this.refillRate);
  }
} 