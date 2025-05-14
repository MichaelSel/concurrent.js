/**
 * Binned Window Rate Limiter implementation
 * 
 * Divides time into small buckets (bins) and tracks operations per bin.
 * This provides a more accurate sliding window implementation that doesn't
 * use weighted averages. The total count across all bins in the window is
 * used to determine if a request is allowed.
 */
import { AbstractRateLimiter } from './RateLimiter';

interface BinnedWindowState {
  bins: Array<{
    timestamp: number;
    count: number;
  }>;
  totalCount: number;
}

export class BinnedWindowRateLimiter extends AbstractRateLimiter {
  private readonly binSize: number;  // Size of each bin in milliseconds
  private readonly numBins: number;   // Number of bins that cover the entire window
  
  /**
   * Creates a new Binned Window Rate Limiter
   * @param capacity Maximum number of operations allowed in the sliding window
   * @param windowMs Time window in milliseconds
   * @param numBins Number of bins to divide the window into (default: 10)
   */
  constructor(capacity: number, windowMs: number, numBins: number = 10) {
    super(capacity, windowMs);
    
    if (numBins <= 0) {
      throw new Error('Number of bins must be a positive number');
    }
    
    if (numBins > windowMs) {
      throw new Error('Number of bins cannot exceed the window size in milliseconds');
    }
    
    this.numBins = numBins;
    this.binSize = Math.floor(windowMs / numBins);
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
    const state = this.cleanupExpiredBins(key, now);
    
    // Check if acquiring the tokens would exceed the capacity
    if (state.totalCount + tokens > this.capacity) {
      return false;
    }
    
    // Find or create the current bin
    const currentBinTimestamp = this.getBinTimestamp(now);
    let currentBin = state.bins.find(bin => bin.timestamp === currentBinTimestamp);
    
    if (!currentBin) {
      currentBin = {
        timestamp: currentBinTimestamp,
        count: 0
      };
      state.bins.push(currentBin);
    }
    
    // Acquire the tokens
    currentBin.count += tokens;
    state.totalCount += tokens;
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
    const state = this.cleanupExpiredBins(key, now);
    return Math.max(0, this.capacity - state.totalCount);
  }
  
  /**
   * Removes expired bins and updates the total count
   * @param key The key to clean up bins for
   * @param now Current timestamp
   * @returns The updated state
   */
  private cleanupExpiredBins(key: string, now: number): BinnedWindowState {
    let state = this.storageMap.get(key) as BinnedWindowState;
    
    // Initialize state if it doesn't exist
    if (!state) {
      state = {
        bins: [],
        totalCount: 0
      };
      this.storageMap.set(key, state);
      return state;
    }
    
    // Calculate the cutoff timestamp for expired bins
    const cutoffTimestamp = now - this.window;
    
    // Remove expired bins and recalculate total count
    const expiredBins = state.bins.filter(bin => bin.timestamp < cutoffTimestamp);
    if (expiredBins.length > 0) {
      state.bins = state.bins.filter(bin => bin.timestamp >= cutoffTimestamp);
      
      // Recalculate total count
      state.totalCount = state.bins.reduce((sum, bin) => sum + bin.count, 0);
      this.storageMap.set(key, state);
    }
    
    return state;
  }
  
  /**
   * Gets the timestamp of the bin containing the given timestamp
   * @param timestamp The timestamp
   * @returns The bin timestamp
   */
  private getBinTimestamp(timestamp: number): number {
    return Math.floor(timestamp / this.binSize) * this.binSize;
  }
  
  /**
   * Gets the distribution of request counts across bins
   * @param key Optional key to partition rate limiting (default: 'default')
   * @returns An array of {timestamp, count} objects representing bins
   */
  getBinDistribution(key: string = 'default'): Array<{timestamp: number, count: number}> {
    const now = Date.now();
    const state = this.cleanupExpiredBins(key, now);
    
    // Return a copy of the bins to prevent external modification
    return [...state.bins].sort((a, b) => a.timestamp - b.timestamp);
  }
  
  /**
   * Gets the current rate (operations per second)
   * @param key Optional key to partition rate limiting (default: 'default')
   * @returns The current rate in operations per second
   */
  getCurrentRate(key: string = 'default'): number {
    const now = Date.now();
    const state = this.cleanupExpiredBins(key, now);
    
    // Calculate rate as operations per second
    return (state.totalCount * 1000) / this.window;
  }
} 