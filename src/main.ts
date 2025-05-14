/**
 * TypeScript Concurrency Demonstrations
 * 
 * This file contains demos for all the concurrency primitives implemented.
 */

// Import all our concurrency primitives
import { Barrier } from './primitives/Barrier';
import { Deferred } from './primitives/Deferred';
import { Mutex } from './primitives/Mutex';
import { pLimit } from './primitives/pLimit';
import { PromisePool } from './primitives/PromisePool';
import { PromiseWithTimeout } from './primitives/PromiseWithTimeout';
import { Semaphore } from './primitives/Semaphore';
import {
    allVsAllSettled,
    raceAndAny,
    schedulingDifferences
} from './promise-utils/AsyncExamples';
import { BinnedWindowRateLimiter } from './rate-limiters/BinnedWindowRateLimiter';
import { FixedWindowRateLimiter } from './rate-limiters/FixedWindowRateLimiter';
import { LeakyBucketRateLimiter } from './rate-limiters/LeakyBucketRateLimiter';
import { SlidingWindowRateLimiter } from './rate-limiters/SlidingWindowRateLimiter';
import { TokenBucketRateLimiter } from './rate-limiters/TokenBucketRateLimiter';
import { CancellationToken, CancellationTokenSource } from './utils/CancellationToken';
import { EventEmitter } from './utils/EventEmitter';
import { PubSub } from './utils/PubSub';
import { TaskManager } from './workers/TaskManager';

/**
 * Utility function to sleep for a given number of milliseconds
 */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Utility function to generate a random delay between min and max
 */
const randomDelay = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Demo of Semaphore
 */
async function semaphoreDemo() {
  console.log('\n----- SEMAPHORE DEMO -----');
  
  // Create a semaphore that allows 3 concurrent accesses
  const semaphore = new Semaphore(3);
  const numTasks = 10;
  
  console.log(`Running ${numTasks} tasks with a semaphore allowing ${semaphore.getAvailablePermits()} concurrent tasks...`);
  
  const runTask = async (id: number) => {
    console.log(`[Task ${id}] Waiting to acquire semaphore`);
    await semaphore.acquire();
    
    try {
      console.log(`[Task ${id}] Acquired semaphore (${semaphore.getQueueLength()} tasks waiting, ${semaphore.getAvailablePermits()} permits remaining)`);
      const delay = randomDelay(500, 2000);
      await sleep(delay);
      console.log(`[Task ${id}] Completed after ${delay}ms`);
    } finally {
      semaphore.release();
      console.log(`[Task ${id}] Released semaphore (${semaphore.getQueueLength()} tasks waiting, ${semaphore.getAvailablePermits()} permits remaining)`);
    }
  };
  
  // Start all tasks
  const tasks = Array.from({ length: numTasks }, (_, i) => runTask(i + 1));
  await Promise.all(tasks);
  
  console.log('All tasks completed');
}

/**
 * Demo of Mutex
 */
async function mutexDemo() {
  console.log('\n----- MUTEX DEMO -----');
  
  const mutex = new Mutex();
  const sharedCounter = { value: 0 };
  const numTasks = 10;
  const incrementsPerTask = 100;
  
  console.log(`Running ${numTasks} tasks that will each increment a counter ${incrementsPerTask} times...`);
  
  const incrementTask = async (id: number) => {
    for (let i = 0; i < incrementsPerTask; i++) {
      // Use the mutex to protect the shared counter
      await mutex.acquire();
      
      try {
        // This is a critical section - only one task can execute this at a time
        const currentValue = sharedCounter.value;
        // Simulate some processing time
        await sleep(1);
        sharedCounter.value = currentValue + 1;
      } finally {
        mutex.release();
      }
      
      // Simulate some non-critical work
      await sleep(randomDelay(5, 15));
    }
    console.log(`[Task ${id}] Completed ${incrementsPerTask} increments`);
  };
  
  console.log('Initial counter value:', sharedCounter.value);
  
  // Start all tasks
  const tasks = Array.from({ length: numTasks }, (_, i) => incrementTask(i + 1));
  await Promise.all(tasks);
  
  console.log('Final counter value:', sharedCounter.value);
  console.log('Expected value:', numTasks * incrementsPerTask);
}

/**
 * Demo of Barrier
 */
async function barrierDemo() {
  console.log('\n----- BARRIER DEMO -----');
  
  const numTasks = 5;
  const barrier = new Barrier(numTasks);
  
  console.log(`Starting ${numTasks} tasks that will synchronize at a barrier...`);
  
  const barrierTask = async (id: number) => {
    // Phase 1 - everyone does some work at their own pace
    const delay = randomDelay(500, 3000);
    console.log(`[Task ${id}] Starting phase 1, will take ${delay}ms`);
    await sleep(delay);
    console.log(`[Task ${id}] Finished phase 1, waiting at barrier (${barrier.getNumberWaiting()} tasks now waiting)`);
    
    // Wait for all tasks to reach the barrier
    await barrier.wait();
    
    // Phase 2 - everyone continues together
    console.log(`[Task ${id}] Passed barrier, starting phase 2`);
    const delay2 = randomDelay(500, 2000);
    await sleep(delay2);
    console.log(`[Task ${id}] Finished phase 2 after ${delay2}ms`);
  };
  
  // Start all tasks
  const tasks = Array.from({ length: numTasks }, (_, i) => barrierTask(i + 1));
  await Promise.all(tasks);
  
  console.log('All tasks completed both phases');
}

/**
 * Demo of pLimit
 */
async function pLimitDemo() {
  console.log('\n----- P-LIMIT DEMO -----');
  
  const concurrency = 3;
  const limit = pLimit(concurrency);
  const numTasks = 10;
  
  console.log(`Running ${numTasks} tasks with concurrency limited to ${concurrency}...`);
  
  const limitedTask = async (id: number) => {
    const delay = randomDelay(1000, 3000);
    console.log(`[Task ${id}] Running (active: ${limit.activeCount()}, queued: ${limit.pendingCount()}), will take ${delay}ms`);
    await sleep(delay);
    return `Task ${id} result after ${delay}ms`;
  };
  
  // Create an array of limited function invocations
  const tasks = Array.from({ length: numTasks }, (_, i) => {
    return limit.add(() => limitedTask(i + 1));
  });
  
  // Wait for all tasks to complete
  const results = await Promise.all(tasks);
  
  console.log('All tasks completed with results:');
  results.forEach(result => console.log(`- ${result}`));
}

/**
 * Demo of PromisePool
 */
async function promisePoolDemo() {
  console.log('\n----- PROMISE POOL DEMO -----');
  
  const concurrency = 3;
  const items = Array.from({ length: 10 }, (_, i) => i + 1);
  
  console.log(`Processing ${items.length} items with a PromisePool (concurrency: ${concurrency})...`);
  
  const processItem = async (item: number): Promise<string> => {
    const delay = randomDelay(1000, 3000);
    console.log(`[Item ${item}] Processing, will take ${delay}ms`);
    await sleep(delay);
    return `Item ${item} processed after ${delay}ms`;
  };
  
  // Process the items using the PromisePool
  const results = await PromisePool.withConcurrency(items, concurrency, processItem);
  
  console.log('All items processed with results:');
  results.forEach(result => console.log(`- ${result}`));
}

/**
 * Demo of WorkerPool
 */
async function workerPoolDemo() {
  console.log('\n----- WORKER POOL DEMO -----');
  console.log('This demo requires a worker implementation. Using a simulated worker for demonstration purposes.');
  
  // For this demo, instead of actual worker threads, we'll simulate them
  class SimulatedWorkerPool {
    private numWorkers: number;
    private idleWorkers: number;
    
    constructor(numWorkers: number) {
      this.numWorkers = numWorkers;
      this.idleWorkers = numWorkers;
      console.log(`Created a simulated worker pool with ${numWorkers} workers`);
    }
    
    async executeTask<T, R>(task: { id: string, data: T }): Promise<R> {
      this.idleWorkers--;
      console.log(`[Task ${task.id}] Assigned to worker (${this.idleWorkers} workers idle)`);
      
      const delay = randomDelay(1000, 3000);
      await sleep(delay);
      
      this.idleWorkers++;
      console.log(`[Task ${task.id}] Completed after ${delay}ms (${this.idleWorkers} workers idle)`);
      
      // Simulate returning processed data
      return task.data as unknown as R;
    }
    
    get size(): number {
      return this.numWorkers;
    }
    
    get busyWorkers(): number {
      return this.numWorkers - this.idleWorkers;
    }
  }
  
  const pool = new SimulatedWorkerPool(3);
  const numTasks = 8;
  
  console.log(`Submitting ${numTasks} tasks to the worker pool...`);
  
  // Submit tasks
  const tasks = Array.from({ length: numTasks }, (_, i) => {
    const taskId = `task-${i + 1}`;
    const taskData = `Data for task ${i + 1}`;
    
    return pool.executeTask({
      id: taskId,
      data: taskData
    });
  });
  
  // Wait for all tasks to complete
  const results = await Promise.all(tasks);
  
  console.log('All tasks completed with results:');
  results.forEach((result, i) => console.log(`- Task ${i + 1}: ${result}`));
}

/**
 * Demo of Rate Limiters
 */
async function rateLimitersDemo() {
  console.log('\n----- RATE LIMITERS DEMO -----');
  
  // We'll demonstrate several rate limiting algorithms
  console.log('1. Fixed Window Rate Limiter:');
  const fixedLimiter = new FixedWindowRateLimiter(5, 5000); // 5 ops per 5 seconds
  
  console.log('2. Sliding Window Rate Limiter:');
  const slidingLimiter = new SlidingWindowRateLimiter(5, 5000); // 5 ops per 5 seconds
  
  console.log('3. Token Bucket Rate Limiter:');
  const tokenBucketLimiter = new TokenBucketRateLimiter(5, 1); // 5 tokens max, 1 token per second
  
  console.log('4. Leaky Bucket Rate Limiter:');
  const leakyBucketLimiter = new LeakyBucketRateLimiter(5, 1); // 5 max queue size, 1 req per second
  
  console.log('5. Binned Window Rate Limiter:');
  const binnedLimiter = new BinnedWindowRateLimiter(5, 5000, 5); // 5 ops per 5 seconds, 5 bins
  
  // Run operations against each rate limiter
  const runOperations = async (name: string, limiter: any, operations: number) => {
    console.log(`\nRunning ${operations} operations against ${name}:`);
    
    let allowed = 0;
    let rejected = 0;
    
    for (let i = 1; i <= operations; i++) {
      const success = limiter.tryAcquire();
      
      if (success) {
        allowed++;
        console.log(`- Operation ${i}: Allowed (${allowed} allowed, ${rejected} rejected)`);
      } else {
        rejected++;
        console.log(`- Operation ${i}: Rejected (${allowed} allowed, ${rejected} rejected)`);
      }
      
      await sleep(500); // 500ms between operations
    }
    
    console.log(`${name} results: ${allowed} allowed, ${rejected} rejected`);
  };
  
  await runOperations('Fixed Window', fixedLimiter, 8);
  await sleep(1000);
  
  await runOperations('Sliding Window', slidingLimiter, 8);
  await sleep(1000);
  
  await runOperations('Token Bucket', tokenBucketLimiter, 8);
  await sleep(1000);
  
  await runOperations('Leaky Bucket', leakyBucketLimiter, 8);
  await sleep(1000);
  
  await runOperations('Binned Window', binnedLimiter, 8);
}

/**
 * Demo of EventEmitter
 */
async function eventEmitterDemo() {
  console.log('\n----- EVENT EMITTER DEMO -----');
  
  // Define the events our emitter can handle
  interface MyEvents {
    'user:login': { userId: string, timestamp: number };
    'user:logout': { userId: string, timestamp: number };
    'data:updated': { data: any, source: string };
  }
  
  // Create the event emitter
  const emitter = new EventEmitter<MyEvents>();
  
  // Register some event handlers
  emitter.on('user:login', ({ userId, timestamp }) => {
    console.log(`User ${userId} logged in at ${new Date(timestamp).toISOString()}`);
  });
  
  emitter.once('user:login', ({ userId }) => {
    console.log(`ONCE HANDLER: Welcome ${userId} on your first login!`);
  });
  
  emitter.on('user:logout', ({ userId, timestamp }) => {
    console.log(`User ${userId} logged out at ${new Date(timestamp).toISOString()}`);
  });
  
  emitter.on('data:updated', ({ data, source }) => {
    console.log(`Data updated by ${source}: ${JSON.stringify(data)}`);
  });
  
  // Emit some events
  console.log('Emitting events:');
  
  emitter.emit('user:login', { userId: 'user123', timestamp: Date.now() });
  await sleep(500);
  
  emitter.emit('data:updated', { data: { value: 42 }, source: 'system' });
  await sleep(500);
  
  emitter.emit('user:login', { userId: 'user456', timestamp: Date.now() });
  await sleep(500);
  
  emitter.emit('user:logout', { userId: 'user123', timestamp: Date.now() });
  await sleep(500);
  
  console.log('Events demonstrated');
}

/**
 * Demo of PubSub
 */
async function pubSubDemo() {
  console.log('\n----- PUB/SUB DEMO -----');
  
  // Define our topics
  interface MyTopics {
    'news': { title: string, content: string };
    'weather': { temperature: number, conditions: string, location: string };
    'system': { type: 'info' | 'warning' | 'error', message: string };
  }
  
  // Create the pubsub system
  const pubsub = new PubSub<MyTopics>();
  
  // Get topics
  const newsTopic = await pubsub.getTopic('news');
  const weatherTopic = await pubsub.getTopic('weather');
  const systemTopic = await pubsub.getTopic('system');
  
  // Subscribe to topics
  console.log('Setting up subscriptions...');
  
  const newsSubscription = newsTopic.subscribe(({ title, content }) => {
    console.log(`NEWS: ${title}\n${content}`);
  });
  
  const weatherSubscription = weatherTopic.subscribe(({ temperature, conditions, location }) => {
    console.log(`WEATHER for ${location}: ${temperature}°C, ${conditions}`);
  });
  
  const systemSubscription = systemTopic.subscribe(({ type, message }) => {
    console.log(`SYSTEM ${type.toUpperCase()}: ${message}`);
  });
  
  // Publish messages
  console.log('\nPublishing messages:');
  
  await newsTopic.publish({
    title: 'TypeScript 5.0 Released',
    content: 'The new version includes many new features and improvements.'
  });
  await sleep(500);
  
  await weatherTopic.publish({
    temperature: 22,
    conditions: 'Sunny',
    location: 'San Francisco'
  });
  await sleep(500);
  
  await systemTopic.publish({
    type: 'info',
    message: 'System update completed successfully'
  });
  await sleep(500);
  
  // Unsubscribe from one topic
  console.log('\nUnsubscribing from weather topic...');
  weatherSubscription.unsubscribe();
  
  await weatherTopic.publish({
    temperature: 18,
    conditions: 'Cloudy',
    location: 'New York'
  });
  await sleep(500);
  
  // Get subscriber counts
  console.log(`\nSubscriber counts: News (${pubsub.subscriberCount('news')}), Weather (${pubsub.subscriberCount('weather')}), System (${pubsub.subscriberCount('system')})`);
  
  // Clean up
  newsSubscription.unsubscribe();
  systemSubscription.unsubscribe();
}

/**
 * Demo of CancellationToken
 */
async function cancellationTokenDemo() {
  console.log('\n----- CANCELLATION TOKEN DEMO -----');
  
  // Create a cancellation token source
  console.log('1. Basic cancellation:');
  const source = new CancellationTokenSource();
  const token = source.getToken();
  
  // Start a long-running task
  const longRunningTask = async () => {
    try {
      console.log('Long-running task started');
      
      for (let i = 1; i <= 10; i++) {
        // Check if we should cancel
        token.throwIfCancelled();
        
        console.log(`Long-running task progress: ${i * 10}%`);
        await sleep(500);
      }
      
      console.log('Long-running task completed successfully');
      return 'Task result';
    } catch (error: any) {
      console.log(`Long-running task was cancelled: ${error.message}`);
      throw error;
    }
  };
  
  // Run the task and cancel it after a delay
  const taskPromise = longRunningTask();
  
  // After 2 seconds, cancel the task
  setTimeout(() => {
    console.log('Cancelling the long-running task...');
    source.cancel();
  }, 2000);
  
  try {
    await taskPromise;
  } catch (error) {
    console.log('Task promise rejected due to cancellation');
  }
  
  // Demo timeout-based cancellation
  console.log('\n2. Timeout-based cancellation:');
  const timeoutSource = CancellationTokenSource.withTimeout(3000);
  const timeoutToken = timeoutSource.getToken();
  
  const timeoutTask = async () => {
    try {
      console.log('Timeout task started, will run for 5 seconds unless cancelled');
      
      for (let i = 1; i <= 10; i++) {
        timeoutToken.throwIfCancelled();
        console.log(`Timeout task progress: ${i * 10}%`);
        await sleep(500);
      }
      
      console.log('Timeout task completed successfully');
    } catch (error: any) {
      console.log(`Timeout task was cancelled: ${error.message}`);
      throw error;
    }
  };
  
  try {
    await timeoutTask();
  } catch (error) {
    console.log('Timeout task promise rejected');
  }
  
  // Demo hierarchical cancellation with bindTo
  console.log('\n3. Hierarchical cancellation:');
  
  // Create the parent (root) cancellation token source
  const rootSource = new CancellationTokenSource();
  const rootToken = rootSource.getToken();
  
  // Create a child token source bound to the parent token
  const childSource = CancellationTokenSource.bindTo(rootToken);
  const childToken = childSource.getToken();
  
  // Create a grandchild token source bound to the child token
  const grandchildSource = CancellationTokenSource.bindTo(childToken);
  const grandchildToken = grandchildSource.getToken();
  
  // Helper function to run a task with a token
  const runCancellableTask = async (name: string, token: CancellationToken, steps: number = 10) => {
    try {
      console.log(`${name} started`);
      
      for (let i = 1; i <= steps; i++) {
        if (token.isCancelled) {
          console.log(`${name} was cancelled due to token being cancelled`);
          return `${name} cancelled at step ${i}`;
        }
        
        console.log(`${name} progress: ${i}/${steps}`);
        await sleep(500);
      }
      
      console.log(`${name} completed successfully`);
      return `${name} result`;
    } catch (error: any) {
      console.error(`${name} error:`, error);
      return `${name} failed with error`;
    }
  };
  
  // Start tasks with different tokens in the hierarchy
  const rootPromise = runCancellableTask('Root task', rootToken);
  const childPromise = runCancellableTask('Child task', childToken);
  const grandchildPromise = runCancellableTask('Grandchild task', grandchildToken);
  
  // After 1.5 seconds, cancel the child source (should cancel child and grandchild tasks, but not root)
  setTimeout(() => {
    console.log('\nCancelling the child source...');
    childSource.cancel('Child source explicitly cancelled');
  }, 1500);
  
  // After 4 seconds, cancel the root source (should cancel the root task)
  setTimeout(() => {
    console.log('\nCancelling the root source...');
    rootSource.cancel('Root source explicitly cancelled');
  }, 4000);
  
  try {
    // Wait for all tasks to complete or be cancelled
    const [rootResult, childResult, grandchildResult] = await Promise.all([
      rootPromise,
      childPromise,
      grandchildPromise
    ]);
    
    console.log('\nAll tasks completed or cancelled:');
    console.log(`- Root task result: ${rootResult}`);
    console.log(`- Child task result: ${childResult}`);
    console.log(`- Grandchild task result: ${grandchildResult}`);
  } catch (error) {
    console.error('Error waiting for tasks:', error);
  }
  
  console.log('Cancellation demo completed');
}

/**
 * Demo of TaskManager
 */
async function taskManagerDemo() {
  console.log('\n----- TASK MANAGER DEMO -----');
  
  // Create a task manager with 2 concurrent tasks
  const taskManager = new TaskManager(2);
  
  // Subscribe to task events
  taskManager.on('taskStarted', (info) => {
    console.log(`Task started: ${info.name}`);
  });
  
  taskManager.on('taskCompleted', (info) => {
    console.log(`Task completed: ${info.name}, result: ${JSON.stringify(info.result)}`);
  });
  
  taskManager.on('taskFailed', (info) => {
    console.log(`Task failed: ${info.name}, error: ${info.error.message}`);
  });
  
  taskManager.on('stateChanged', (state) => {
    console.log(`Shared state changed: ${JSON.stringify(state)}`);
  });
  
  // Add some tasks that use shared state
  console.log('Adding tasks that manipulate shared state...');
  
  // Task 1: Initialize counter
  const task1 = async (token: CancellationToken, getState: <K>(key: string) => Promise<K>, setState: <K>(key: string, value: K) => Promise<void>) => {
    console.log('Task 1: Initializing counter');
    await setState('counter', 0);
    await sleep(1000);
    return 'Counter initialized';
  };
  
  // Task 2: Increment counter 5 times
  const task2 = async (token: CancellationToken, getState: <K>(key: string) => Promise<K>, setState: <K>(key: string, value: K) => Promise<void>) => {
    console.log('Task 2: Incrementing counter 5 times');
    
    for (let i = 0; i < 5; i++) {
      token.throwIfCancelled();
      
      const currentValue = await getState<number>('counter');
      console.log(`Task 2: Incrementing counter from ${currentValue} to ${currentValue + 1}`);
      
      await setState('counter', currentValue + 1);
      await sleep(500);
    }
    
    return 'Counter incremented 5 times';
  };
  
  // Task 3: Double the counter value
  const task3 = async (token: CancellationToken, getState: <K>(key: string) => Promise<K>, setState: <K>(key: string, value: K) => Promise<void>) => {
    console.log('Task 3: Doubling counter value');
    
    const currentValue = await getState<number>('counter');
    await sleep(1000);
    await setState('counter', currentValue * 2);
    
    return `Counter doubled from ${currentValue} to ${currentValue * 2}`;
  };
  
  // Task 4: Will be cancelled
  const task4 = async (token: CancellationToken, getState: <K>(key: string) => Promise<K>, setState: <K>(key: string, value: K) => Promise<void>) => {
    console.log('Task 4: Long-running task that will be cancelled');
    
    for (let i = 0; i < 10; i++) {
      token.throwIfCancelled();
      console.log(`Task 4: Progress ${i + 1}/10`);
      await sleep(500);
    }
    
    return 'Task 4 completed';
  };
  
  // Add the tasks to the task manager
  const task1Id = await taskManager.addTask(task1, { name: 'Initialize counter' });
  const task2Id = await taskManager.addTask(task2, { name: 'Increment counter' });
  const task3Id = await taskManager.addTask(task3, { name: 'Double counter' });
  const task4Id = await taskManager.addTask(task4, { name: 'Long-running task' });
  
  // Cancel task 4 after a delay
  setTimeout(async () => {
    console.log('Cancelling task 4...');
    await taskManager.cancelTask(task4Id);
  }, 3000);
  
  // Wait for all tasks to complete
  await sleep(10000);
  
  // Report the final state
  const finalState = await taskManager.getFullState();
  console.log('Final shared state:', finalState);
  
  console.log('Task manager demo completed');
}

/**
 * Demo of Advanced Asynchronous Patterns
 */
async function advancedAsyncDemo() {
  console.log('\n----- ADVANCED ASYNC PATTERNS DEMO -----');
  
  // 1. Using Deferred to create a controllable promise
  console.log('\n1. Deferred Promise:');
  const deferred = new Deferred<string>();
  
  // Use the deferred promise
  console.log('Starting deferred promise handling...');
  
  // Start a task that will wait for the deferred promise
  const deferredTask = (async () => {
    console.log('Waiting for deferred promise to resolve...');
    const result = await deferred.promise;
    console.log(`Deferred promise resolved with: ${result}`);
    return result;
  })();
  
  // Resolve the promise after a delay
  setTimeout(() => {
    console.log('Resolving deferred promise');
    deferred.resolve('Success!');
  }, 1000);
  
  await deferredTask;
  
  // Demonstrate Deferred.withTimeout static method
  console.log('\nUsing Deferred.withTimeout:');
  const timeoutDeferred = Deferred.withTimeout('Delayed result', 2000);
  console.log('Waiting for timed deferred promise...');
  const timeoutResult = await timeoutDeferred.promise;
  console.log(`Timed deferred resolved with: ${timeoutResult}`);
  
  // 2. Promise timeouts with PromiseWithTimeout
  console.log('\n2. Promise Timeouts:');
  
  // Create a slow operation
  const slowOperation = async (): Promise<string> => {
    console.log('Slow operation started (takes 3 seconds)');
    await sleep(3000);
    return 'Slow operation completed';
  };
  
  // With short timeout (should timeout)
  console.log('Running with short timeout (1 second):');
  try {
    const resultWithShortTimeout = await PromiseWithTimeout.withTimeout(slowOperation(), 1000);
    console.log('Result:', resultWithShortTimeout);
  } catch (error: any) {
    console.log('Short timeout error:', error.message);
  }
  
  // With longer timeout (should succeed)
  console.log('Running with long timeout (5 seconds):');
  try {
    const resultWithLongTimeout = await PromiseWithTimeout.withTimeout(slowOperation(), 5000);
    console.log('Result:', resultWithLongTimeout);
  } catch (error: any) {
    console.log('Long timeout error:', error.message);
  }
  
  // Demonstrate the execute method
  console.log('\nUsing PromiseWithTimeout.execute:');
  try {
    const executeResult = await PromiseWithTimeout.execute(slowOperation, 5000);
    console.log('Execute result:', executeResult);
  } catch (error: any) {
    console.log('Execute error:', error.message);
  }
  
  // Demonstrate the wrapper function
  console.log('\nUsing PromiseWithTimeout.createTimeoutWrapper:');
  const timeoutWrappedFn = PromiseWithTimeout.createTimeoutWrapper(slowOperation, 5000);
  try {
    const wrapperResult = await timeoutWrappedFn();
    console.log('Wrapper result:', wrapperResult);
  } catch (error: any) {
    console.log('Wrapper error:', error.message);
  }
  
  // 3. Promise.all vs Promise.allSettled
  console.log('\n3. Promise.all vs Promise.allSettled:');
  
  const successPromise1 = Promise.resolve('First success');
  const successPromise2 = Promise.resolve('Second success');
  const failPromise = Promise.reject(new Error('Deliberate failure'));
  
  console.log('Running with mix of successful and failing promises:');
  const allVsSettledResults = await allVsAllSettled([successPromise1, failPromise, successPromise2]);
  
  console.log('Promise.all result:');
  console.log(JSON.stringify(allVsSettledResults.all, null, 2));
  
  console.log('Promise.allSettled result:');
  console.log(JSON.stringify(allVsSettledResults.allSettled, null, 2));
  
  // 4. Promise.race vs Promise.any
  console.log('\n4. Promise.race vs Promise.any:');
  const raceAndAnyResults = await raceAndAny();
  
  console.log('Promise.race result:', raceAndAnyResults.race);
  console.log('Promise.any result:', raceAndAnyResults.any);
  
  // 5. queueMicrotask vs setImmediate vs setTimeout
  console.log('\n5. Scheduling Differences:');
  
  const results: { method: string, timeMs: number }[] = [];
  
  await new Promise<void>(resolve => {
    schedulingDifferences((method, timeMs) => {
      results.push({ method, timeMs });
      
      // When we have all 4 results (or after 1 second), resolve the promise
      if (results.length === 4 || timeMs > 1000) {
        setTimeout(() => resolve(), 100);
      }
    });
    
    // Ensure the promise resolves even if not all callbacks fire
    setTimeout(() => resolve(), 1000);
  });
  
  console.log('\nExecution order summary:');
  results.sort((a, b) => a.timeMs - b.timeMs);
  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.method} - ${result.timeMs}ms`);
  });
  
  console.log('\nAdvanced async patterns demo completed');
}

/**
 * Run all demos
 */
async function runAllDemos() {
  console.log('======= TYPESCRIPT CONCURRENCY DEMOS =======');
  
  try {
    await semaphoreDemo();
    await mutexDemo();
    await barrierDemo();
    await pLimitDemo();
    await promisePoolDemo();
    await workerPoolDemo();
    await rateLimitersDemo();
    await eventEmitterDemo();
    await pubSubDemo();
    await cancellationTokenDemo();
    await advancedAsyncDemo();
    await taskManagerDemo();
    
    console.log('\n======= ALL DEMOS COMPLETED =======');
  } catch (error) {
    console.error('Error running demos:', error);
  }
}

// Run all demos
runAllDemos(); 