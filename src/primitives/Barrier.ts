/**
 * Barrier implementation in TypeScript
 * 
 * A barrier is a synchronization primitive that blocks until a set number
 * of tasks have reached it, then allows all of them to proceed together.
 */
export class Barrier {
  private parties: number;
  private count: number;
  private generation: number = 0;
  private waiters: Map<number, Array<() => void>> = new Map();

  /**
   * Creates a new barrier that waits for the specified number of parties
   * @param parties The number of tasks that must arrive before the barrier opens
   */
  constructor(parties: number) {
    if (parties <= 0) {
      throw new Error('Number of parties must be positive');
    }
    this.parties = parties;
    this.count = parties;
    this.waiters.set(0, []);
  }

  /**
   * Wait at the barrier until all parties have arrived
   * @returns A promise that resolves when all parties have arrived at the barrier
   */
  async wait(): Promise<number> {
    const currentGeneration = this.generation;
    
    // Decrement count and check if we're the last party to arrive
    this.count--;
    
    if (this.count === 0) {
      // The last party resets the barrier for next use
      this.count = this.parties;
      this.generation++;
      
      // Release all waiting parties
      const waiters = this.waiters.get(currentGeneration) || [];
      waiters.forEach(resolve => resolve());
      this.waiters.delete(currentGeneration);
      this.waiters.set(this.generation, []);
      
      return currentGeneration;
    }
    
    // Wait for the barrier to be tripped
    return new Promise<number>(resolve => {
      const gen = this.waiters.get(currentGeneration);
      if (gen) {
        gen.push(() => resolve(currentGeneration));
      }
    });
  }

  /**
   * Reset the barrier to its initial state
   */
  reset(): void {
    const currentGeneration = this.generation;
    this.generation++;
    this.count = this.parties;
    
    // Signal to any waiting parties that a reset occurred (they will throw BrokenBarrierError)
    const waiters = this.waiters.get(currentGeneration) || [];
    waiters.forEach(resolve => resolve());
    
    this.waiters.delete(currentGeneration);
    this.waiters.set(this.generation, []);
  }

  /**
   * Get the number of parties still needed to trip the barrier
   */
  getNumberWaiting(): number {
    return this.parties - this.count;
  }

  /**
   * Get the total number of parties required
   */
  getParties(): number {
    return this.parties;
  }
} 