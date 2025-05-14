/**
 * Leaky Bucket Rate Limiter implementation
 * 
 * The leaky bucket algorithm treats requests like water being poured into
 * a bucket that leaks at a constant rate. If the bucket overflows (too many
 * requests), excess requests are discarded. Unlike the token bucket, the leaky
 * bucket enforces a constant outflow rate, which smooths out bursts.
 */
import { AbstractRateLimiter } from './RateLimiter';

interface LeakyBucketState {
  water: number;        // Current water level in the bucket (queued requests)
  lastDrip: number;     // Timestamp of the last drip
}

export class LeakyBucketRateLimiter extends AbstractRateLimiter {
  private readonly dripRate: number;  // Water drips per millisecond (outflow rate)
  
  /**
   * Creates a new Leaky Bucket Rate Limiter
   * @param capacity Maximum amount of water the bucket can hold (max queue size)
   * @param dripRatePerSecond Rate at which water drips out of the bucket (requests per second)
   */
  constructor(capacity: number, dripRatePerSecond: number) {
    // The window parameter is not used in the same way as other rate limiters,
    // we pass 1000 (milliseconds) as a placeholder
    super(capacity, 1000);
    
    if (dripRatePerSecond <= 0) {
      throw new Error('Drip rate must be a positive number');
    }
    
    // Convert to drips per millisecond for internal calculations
    this.dripRate = dripRatePerSecond / 1000;
  }

  /**
   * Tries to add water to the bucket (process a request)
   * @param key Optional key to partition rate limiting (default: 'default')
   * @param amount Amount of water to add (default: 1)
   * @returns Whether the water was successfully added
   */
  tryAcquire(key: string = 'default', amount: number = 1): boolean {
    if (amount <= 0) {
      throw new Error('Amount must be a positive number');
    }
    
    const now = Date.now();
    const state = this.dripWater(key, now);
    
    // Check if adding the water would overflow the bucket
    if (state.water + amount > this.capacity) {
      return false;
    }
    
    // Add the water
    state.water += amount;
    this.storageMap.set(key, state);
    
    return true;
  }
  
  /**
   * Gets the remaining capacity in the bucket
   * @param key Optional key to partition rate limiting (default: 'default')
   * @returns The remaining capacity
   */
  getRemainingTokens(key: string = 'default'): number {
    const now = Date.now();
    const state = this.dripWater(key, now);
    return this.capacity - state.water;
  }
  
  /**
   * Simulates water dripping out of the bucket based on elapsed time
   * @param key The key to drip water for
   * @param now Current timestamp
   * @returns The updated state
   */
  private dripWater(key: string, now: number): LeakyBucketState {
    let state = this.storageMap.get(key) as LeakyBucketState;
    
    // Initialize state if it doesn't exist
    if (!state) {
      state = {
        water: 0,  // Start with an empty bucket
        lastDrip: now
      };
      this.storageMap.set(key, state);
      return state;
    }
    
    // Calculate elapsed time since last drip
    const elapsedTime = now - state.lastDrip;
    
    if (elapsedTime > 0 && state.water > 0) {
      // Calculate water to drip based on elapsed time and drip rate
      const waterToDrip = elapsedTime * this.dripRate;
      
      // Drip water, but don't go below zero
      state.water = Math.max(0, state.water - waterToDrip);
      state.lastDrip = now;
      
      this.storageMap.set(key, state);
    } else if (elapsedTime > 0) {
      // Even if no water to drip, update the lastDrip timestamp
      state.lastDrip = now;
      this.storageMap.set(key, state);
    }
    
    return state;
  }
  
  /**
   * Gets the time in milliseconds until the bucket can accept the specified amount of water
   * @param key Optional key to partition rate limiting (default: 'default')
   * @param amount Amount of water needed (default: 1)
   * @returns Time in milliseconds until space is available
   */
  getTimeUntilAvailable(key: string = 'default', amount: number = 1): number {
    if (amount <= 0) {
      throw new Error('Amount must be a positive number');
    }
    
    if (amount > this.capacity) {
      throw new Error(`Requested amount (${amount}) exceeds bucket capacity (${this.capacity})`);
    }
    
    const now = Date.now();
    const state = this.dripWater(key, now);
    
    // If we already have enough capacity, return 0
    if (this.capacity - state.water >= amount) {
      return 0;
    }
    
    // Calculate how much water needs to drip out to make room
    const waterToDrip = state.water + amount - this.capacity;
    
    // Calculate time to drip that water at the current drip rate
    return Math.ceil(waterToDrip / this.dripRate);
  }
  
  /**
   * Gets the current water level in the bucket
   * @param key Optional key to partition rate limiting (default: 'default')
   * @returns The current water level
   */
  getWaterLevel(key: string = 'default'): number {
    const now = Date.now();
    const state = this.dripWater(key, now);
    return state.water;
  }
} 