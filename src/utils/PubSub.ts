/**
 * Pub/Sub system implementation in TypeScript
 * 
 * Provides a decoupled way for components to communicate via
 * topics (channels) with type-safe message passing.
 */
import { Mutex } from '../primitives/Mutex';
import { EventEmitter, EventHandler } from './EventEmitter';

// Type definitions
export type TopicHandler<T = any> = EventHandler<T>;
export type TopicMap = Record<string, any>;

/**
 * Class representing a Topic in the pub/sub system
 */
export class Topic<T> {
  private readonly name: string;
  private readonly pubSub: PubSub<any>;
  
  /**
   * Creates a new Topic
   * @param name The name of the topic
   * @param pubSub The PubSub instance this topic belongs to
   */
  constructor(name: string, pubSub: PubSub<any>) {
    this.name = name;
    this.pubSub = pubSub;
  }
  
  /**
   * Gets the name of the topic
   */
  getName(): string {
    return this.name;
  }
  
  /**
   * Publishes a message to this topic
   * @param message The message to publish
   * @returns Promise resolving to whether the message was delivered to any subscribers
   */
  async publish(message: T): Promise<boolean> {
    return this.pubSub.publish(this.name, message);
  }
  
  /**
   * Subscribes to this topic
   * @param handler The handler function to call when a message is published
   * @returns Subscription object with an unsubscribe method
   */
  subscribe(handler: TopicHandler<T>): Subscription {
    return this.pubSub.subscribe(this.name, handler);
  }
}

/**
 * Interface representing a subscription to a topic
 */
export interface Subscription {
  /**
   * Unsubscribes from the topic
   */
  unsubscribe(): void;
}

/**
 * PubSub class implementing the publish-subscribe pattern
 */
export class PubSub<Topics extends TopicMap> {
  private emitter: EventEmitter<Topics>;
  private topics: Map<keyof Topics, Topic<any>> = new Map();
  private mutex: Mutex = new Mutex();
  
  /**
   * Creates a new PubSub instance
   * @param maxSubscribers Optional maximum number of subscribers per topic
   */
  constructor(maxSubscribers: number = 100) {
    this.emitter = new EventEmitter<Topics>();
    this.emitter.setMaxListeners(maxSubscribers);
  }
  
  /**
   * Sets the maximum number of subscribers allowed per topic
   * @param n The maximum number of subscribers
   */
  setMaxSubscribers(n: number): void {
    this.emitter.setMaxListeners(n);
  }
  
  /**
   * Gets a topic by name, creating it if it doesn't exist
   * @param name The name of the topic
   * @returns The topic
   */
  async getTopic<K extends keyof Topics>(name: K): Promise<Topic<Topics[K]>> {
    await this.mutex.acquire();
    
    try {
      if (!this.topics.has(name)) {
        this.topics.set(name, new Topic<Topics[K]>(name as string, this));
      }
      
      return this.topics.get(name) as Topic<Topics[K]>;
    } finally {
      this.mutex.release();
    }
  }
  
  /**
   * Publishes a message to a topic
   * @param topic The name of the topic
   * @param message The message to publish
   * @returns Promise resolving to whether the message was delivered to any subscribers
   */
  async publish<K extends keyof Topics>(topic: K, message: Topics[K]): Promise<boolean> {
    return this.emitter.emitAsync(topic, message);
  }
  
  /**
   * Subscribes to a topic
   * @param topic The name of the topic
   * @param handler The handler function to call when a message is published
   * @returns Subscription object with an unsubscribe method
   */
  subscribe<K extends keyof Topics>(topic: K, handler: TopicHandler<Topics[K]>): Subscription {
    this.emitter.on(topic, handler);
    
    // Return a subscription object with unsubscribe method
    return {
      unsubscribe: () => {
        this.emitter.off(topic, handler);
      }
    };
  }
  
  /**
   * Gets the number of subscribers for a topic
   * @param topic The name of the topic
   * @returns The number of subscribers
   */
  subscriberCount<K extends keyof Topics>(topic: K): number {
    return this.emitter.listenerCount(topic);
  }
  
  /**
   * Gets all topic names with subscribers
   * @returns Array of topic names
   */
  getActiveTopics(): Array<keyof Topics> {
    return this.emitter.eventNames();
  }
  
  /**
   * Clears all subscribers for a topic, or all subscribers for all topics if no topic is specified
   * @param topic Optional topic name
   */
  clearSubscriptions<K extends keyof Topics>(topic?: K): void {
    this.emitter.removeAllListeners(topic);
  }
} 