/**
 * PromisePool implementation in TypeScript
 * 
 * Executes a collection of promises with a concurrency limit.
 */
export class PromisePool<T, R> {
  private readonly concurrency: number;
  private readonly items: T[];
  private readonly taskFn: (item: T) => Promise<R>;
  private activeCount: number = 0;
  private index: number = 0;
  private results: R[] = [];
  private readonly abortController: AbortController;

  /**
   * Creates a new PromisePool
   * @param items Items to process
   * @param concurrency Maximum number of promises to execute concurrently
   * @param taskFn Function that returns a Promise for each item
   */
  constructor(items: T[], concurrency: number, taskFn: (item: T) => Promise<R>) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('Expected `concurrency` to be a positive integer');
    }
    
    this.concurrency = concurrency;
    this.items = [...items];  // Create a copy to avoid mutation
    this.taskFn = taskFn;
    this.results = new Array(items.length);
    this.abortController = new AbortController();
  }

  /**
   * Starts processing all items with limited concurrency
   * @returns Promise that resolves to array of results
   */
  async start(): Promise<R[]> {
    const { signal } = this.abortController;
    
    // Return empty result for empty input
    if (this.items.length === 0) {
      return [];
    }
    
    return new Promise<R[]>((resolve, reject) => {
      // Abort handler
      signal.addEventListener('abort', () => {
        reject(this.abortController.signal.reason);
      });
      
      const next = async () => {
        // Check if we're done processing all items
        if (this.index >= this.items.length) {
          if (this.activeCount === 0) {
            resolve(this.results);
          }
          return;
        }
        
        // Process the next item
        const currentIndex = this.index++;
        const item = this.items[currentIndex];
        this.activeCount++;
        
        try {
          // Check if we've been aborted before starting a new task
          if (signal.aborted) {
            return;
          }
          
          const result = await this.taskFn(item);
          this.results[currentIndex] = result;
        } catch (error) {
          // Only reject the first error, and then abort
          if (!signal.aborted) {
            this.abortController.abort(error);
          }
        } finally {
          this.activeCount--;
          next();
        }
      };
      
      // Start processing up to `concurrency` items
      for (let i = 0; i < this.concurrency && i < this.items.length; i++) {
        next();
      }
    });
  }
  
  /**
   * Aborts all pending operations
   * @param reason The reason for aborting
   */
  abort(reason?: any): void {
    if (!this.abortController.signal.aborted) {
      this.abortController.abort(reason);
    }
  }
  
  /**
   * Static method to execute a task function on all items with limited concurrency
   * @param items Items to process
   * @param concurrency Maximum number of promises to execute concurrently
   * @param taskFn Function that returns a Promise for each item
   */
  static async withConcurrency<T, R>(
    items: T[], 
    concurrency: number, 
    taskFn: (item: T) => Promise<R>
  ): Promise<R[]> {
    const pool = new PromisePool(items, concurrency, taskFn);
    return pool.start();
  }
} 