/**
 * Type-safe EventEmitter implementation in TypeScript
 * 
 * Provides a way to register handlers for specific events and emit events
 * with type-safe payloads.
 */

// Type definitions
export type EventHandler<T = any> = (payload: T) => void | Promise<void>;
export type EventMap = Record<string, any>;

/**
 * Type-safe EventEmitter class
 */
export class EventEmitter<Events extends EventMap> {
  private handlers: Map<keyof Events, Set<EventHandler<any>>> = new Map();
  private onceHandlers: Map<keyof Events, Set<EventHandler<any>>> = new Map();
  private maxListeners: number = 10; // Default max listeners per event
  
  /**
   * Sets the maximum number of listeners allowed per event
   * @param n The maximum number of listeners per event
   * @returns This instance for method chaining
   */
  setMaxListeners(n: number): this {
    if (n <= 0) {
      throw new Error('Maximum listeners must be a positive number');
    }
    this.maxListeners = n;
    return this;
  }
  
  /**
   * Gets the maximum number of listeners allowed per event
   * @returns The maximum number of listeners
   */
  getMaxListeners(): number {
    return this.maxListeners;
  }
  
  /**
   * Registers a listener for an event
   * @param event The event name
   * @param handler The event handler function
   * @returns This instance for method chaining
   */
  on<E extends keyof Events>(event: E, handler: EventHandler<Events[E]>): this {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    
    const handlers = this.handlers.get(event)!;
    
    // Check if adding this handler would exceed the max listeners
    if (handlers.size >= this.maxListeners) {
      console.warn(`Warning: Possible memory leak detected. ${handlers.size} listeners added for event '${String(event)}'.`);
    }
    
    handlers.add(handler);
    return this;
  }
  
  /**
   * Registers a one-time listener for an event
   * @param event The event name
   * @param handler The event handler function
   * @returns This instance for method chaining
   */
  once<E extends keyof Events>(event: E, handler: EventHandler<Events[E]>): this {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set());
    }
    
    const handlers = this.onceHandlers.get(event)!;
    
    // Check if adding this handler would exceed the max listeners
    if (handlers.size >= this.maxListeners) {
      console.warn(`Warning: Possible memory leak detected. ${handlers.size} one-time listeners added for event '${String(event)}'.`);
    }
    
    handlers.add(handler);
    return this;
  }
  
  /**
   * Unregisters a listener for an event
   * @param event The event name
   * @param handler The event handler function to remove
   * @returns This instance for method chaining
   */
  off<E extends keyof Events>(event: E, handler: EventHandler<Events[E]>): this {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
    
    const onceHandlers = this.onceHandlers.get(event);
    if (onceHandlers) {
      onceHandlers.delete(handler);
    }
    
    return this;
  }
  
  /**
   * Unregisters all listeners for an event, or all listeners for all events if no event is specified
   * @param event Optional event name
   * @returns This instance for method chaining
   */
  removeAllListeners<E extends keyof Events>(event?: E): this {
    if (event) {
      this.handlers.delete(event);
      this.onceHandlers.delete(event);
    } else {
      this.handlers.clear();
      this.onceHandlers.clear();
    }
    return this;
  }
  
  /**
   * Gets the number of listeners for an event
   * @param event The event name
   * @returns The number of listeners
   */
  listenerCount<E extends keyof Events>(event: E): number {
    const handlers = this.handlers.get(event) || new Set();
    const onceHandlers = this.onceHandlers.get(event) || new Set();
    return handlers.size + onceHandlers.size;
  }
  
  /**
   * Gets all event names with registered listeners
   * @returns Array of event names
   */
  eventNames(): Array<keyof Events> {
    const events = new Set<keyof Events>();
    
    for (const event of this.handlers.keys()) {
      events.add(event);
    }
    
    for (const event of this.onceHandlers.keys()) {
      events.add(event);
    }
    
    return Array.from(events);
  }
  
  /**
   * Gets all listeners for an event
   * @param event The event name
   * @returns Array of listeners
   */
  listeners<E extends keyof Events>(event: E): EventHandler<Events[E]>[] {
    const handlers = Array.from(this.handlers.get(event) || []);
    const onceHandlers = Array.from(this.onceHandlers.get(event) || []);
    return [...handlers, ...onceHandlers];
  }
  
  /**
   * Emits an event with a payload
   * @param event The event name
   * @param payload The event payload
   * @returns Whether the event had listeners
   */
  emit<E extends keyof Events>(event: E, payload: Events[E]): boolean {
    const handlers = this.handlers.get(event);
    const onceHandlers = this.onceHandlers.get(event);
    
    let hasListeners = false;
    
    // Call regular handlers
    if (handlers && handlers.size > 0) {
      hasListeners = true;
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in event handler for '${String(event)}':`, error);
        }
      }
    }
    
    // Call once handlers
    if (onceHandlers && onceHandlers.size > 0) {
      hasListeners = true;
      // Create a copy of the handlers to iterate, since we'll be modifying the set
      const handlersToCall = Array.from(onceHandlers);
      // Clear all once handlers for this event
      this.onceHandlers.delete(event);
      
      for (const handler of handlersToCall) {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in once event handler for '${String(event)}':`, error);
        }
      }
    }
    
    return hasListeners;
  }
  
  /**
   * Asynchronously emits an event and waits for all handlers to complete
   * @param event The event name
   * @param payload The event payload
   * @returns Promise resolving to whether the event had listeners
   */
  async emitAsync<E extends keyof Events>(event: E, payload: Events[E]): Promise<boolean> {
    const handlers = this.handlers.get(event);
    const onceHandlers = this.onceHandlers.get(event);
    
    let hasListeners = false;
    const promises: Promise<any>[] = [];
    
    // Call regular handlers
    if (handlers && handlers.size > 0) {
      hasListeners = true;
      for (const handler of handlers) {
        try {
          const result = handler(payload);
          if (result instanceof Promise) {
            promises.push(result);
          }
        } catch (error) {
          console.error(`Error in event handler for '${String(event)}':`, error);
        }
      }
    }
    
    // Call once handlers
    if (onceHandlers && onceHandlers.size > 0) {
      hasListeners = true;
      // Create a copy of the handlers to iterate, since we'll be modifying the set
      const handlersToCall = Array.from(onceHandlers);
      // Clear all once handlers for this event
      this.onceHandlers.delete(event);
      
      for (const handler of handlersToCall) {
        try {
          const result = handler(payload);
          if (result instanceof Promise) {
            promises.push(result);
          }
        } catch (error) {
          console.error(`Error in once event handler for '${String(event)}':`, error);
        }
      }
    }
    
    // Wait for all promises to resolve
    if (promises.length > 0) {
      await Promise.all(promises);
    }
    
    return hasListeners;
  }
} 