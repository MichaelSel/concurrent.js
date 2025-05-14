/**
 * Cancellation Token implementation in TypeScript
 * 
 * Provides a mechanism to signal cancellation to operations that can be canceled.
 */

/**
 * Error thrown when an operation is canceled
 */
export class CancellationError extends Error {
  constructor(message: string = 'The operation was canceled') {
    super(message);
    this.name = 'CancellationError';
  }
}

/**
 * Interface to register cancellation callbacks
 */
export interface CancellationToken {
  /**
   * Register a callback to be executed when the token is canceled
   * @param callback Callback function to execute on cancellation
   * @returns A function to unregister the callback
   */
  register(callback: () => void): () => void;
  
  /**
   * Check if the token has been canceled
   */
  isCancelled: boolean;
  
  /**
   * Throws a CancellationError if the token has been canceled
   */
  throwIfCancelled(): void;
}

/**
 * Controls a CancellationToken and can be used to signal cancellation
 */
export class CancellationTokenSource {
  private _isCancelled: boolean = false;
  private callbacks: Set<() => void> = new Set();
  private token: CancellationToken;
  private parentUnregister?: () => void;
  
  constructor() {
    // Create the token interface
    const source = this; // Store reference to the source for use in the token
    
    this.token = {
      register: (callback: () => void): (() => void) => {
        // Don't add if already cancelled
        if (source._isCancelled) {
          callback();
          return () => {};
        }
        
        source.callbacks.add(callback);
        
        // Return a function to unregister the callback
        return () => {
          source.callbacks.delete(callback);
        };
      },
      
      get isCancelled(): boolean {
        return source._isCancelled;
      },
      
      throwIfCancelled: (): void => {
        if (source._isCancelled) {
          throw new CancellationError();
        }
      }
    };
  }
  
  /**
   * Gets the token that can be passed to cancelable operations
   */
  getToken(): CancellationToken {
    return this.token;
  }
  
  /**
   * Cancel the token and trigger all registered callbacks
   * @param message Optional custom cancellation message
   */
  cancel(message?: string): void {
    if (this._isCancelled) {
      return; // Already cancelled
    }
    
    this._isCancelled = true;
    
    // Execute all callbacks
    for (const callback of this.callbacks) {
      try {
        callback();
      } catch (error) {
        console.error('Error in cancellation callback:', error);
      }
    }
    
    // Clear the callbacks
    this.callbacks.clear();
    
    // Unregister from parent token if bound
    if (this.parentUnregister) {
      this.parentUnregister();
      this.parentUnregister = undefined;
    }
  }
  
  /**
   * Check if the token has been canceled
   */
  get cancelled(): boolean {
    return this._isCancelled;
  }
  
  /**
   * Creates a new token source that will be cancelled when the timeout elapses
   * @param timeoutMs The timeout in milliseconds
   * @returns A new CancellationTokenSource
   */
  static withTimeout(timeoutMs: number): CancellationTokenSource {
    const source = new CancellationTokenSource();
    
    if (timeoutMs <= 0) {
      source.cancel('Timeout of 0 or negative value');
      return source;
    }
    
    const timerId = setTimeout(() => {
      source.cancel(`Operation timed out after ${timeoutMs}ms`);
    }, timeoutMs);
    
    // Clear the timer if cancelled through other means
    source.token.register(() => {
      clearTimeout(timerId);
    });
    
    return source;
  }
  
  /**
   * Creates a token source that will be cancelled when any of the given tokens are cancelled
   * @param tokens The tokens to link
   * @returns A new CancellationTokenSource
   */
  static any(...tokens: CancellationToken[]): CancellationTokenSource {
    const source = new CancellationTokenSource();
    
    // Check if any token is already cancelled
    for (const token of tokens) {
      if (token.isCancelled) {
        source.cancel('One of the source tokens was already cancelled');
        break;
      }
    }
    
    // Register with each token
    const unregisterFunctions = tokens.map(token => {
      return token.register(() => {
        source.cancel('One of the source tokens was cancelled');
      });
    });
    
    // Clean up registrations when this token is cancelled
    source.token.register(() => {
      unregisterFunctions.forEach(unregister => unregister());
    });
    
    return source;
  }
  
  /**
   * Creates a new token source bound to an existing token
   * 
   * The returned source can be cancelled independently, but will also
   * be cancelled if the parent token is cancelled. This creates a 
   * hierarchical cancellation dependency where cancellation flows downward.
   * 
   * @param parentToken The token to bind to
   * @returns A new CancellationTokenSource bound to the parent token
   */
  static bindTo(parentToken: CancellationToken): CancellationTokenSource {
    const source = new CancellationTokenSource();
    
    // If parent is already cancelled, cancel the new source immediately
    if (parentToken.isCancelled) {
      source.cancel('Parent token was already cancelled');
      return source;
    }
    
    // Register with parent token - cancel this source when parent is cancelled
    source.parentUnregister = parentToken.register(() => {
      source.cancel('Parent token was cancelled');
    });
    
    return source;
  }
}

/**
 * Utilities for working with CancellationTokens
 */
export class CancellationTokenUtils {
  /**
   * Creates a Promise that rejects when the token is cancelled
   * @param token The cancellation token
   * @returns A Promise that rejects with a CancellationError when the token is cancelled
   */
  static createCancellationPromise(token: CancellationToken): Promise<never> {
    return new Promise<never>((_, reject) => {
      if (token.isCancelled) {
        reject(new CancellationError());
        return;
      }
      
      token.register(() => {
        reject(new CancellationError());
      });
    });
  }
  
  /**
   * Wraps a Promise to make it cancellable with a token
   * @param promise The promise to wrap
   * @param token The cancellation token
   * @returns A Promise that resolves with the original result or rejects if cancelled
   */
  static makeCancellable<T>(promise: Promise<T>, token: CancellationToken): Promise<T> {
    // Return the original promise if already cancelled
    if (token.isCancelled) {
      return Promise.reject(new CancellationError());
    }
    
    // Create a race between the promise and cancellation
    return Promise.race([
      promise,
      this.createCancellationPromise(token)
    ]);
  }
  
  /**
   * Sleeps for the specified duration, but can be cancelled
   * @param ms The duration to sleep in milliseconds
   * @param token The cancellation token
   * @returns A Promise that resolves after the duration or rejects if cancelled
   */
  static async sleep(ms: number, token: CancellationToken): Promise<void> {
    // Check if already cancelled
    if (token.isCancelled) {
      throw new CancellationError();
    }
    
    return new Promise<void>((resolve, reject) => {
      const timerId = setTimeout(resolve, ms);
      
      // Register for cancellation
      const unregister = token.register(() => {
        clearTimeout(timerId);
        reject(new CancellationError());
      });
      
      // Unregister when timer completes
      setTimeout(() => {
        unregister();
      }, ms);
    });
  }
} 