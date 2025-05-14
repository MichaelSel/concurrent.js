/**
 * Task Manager implementation in TypeScript
 * 
 * Manages a collection of tasks that can run concurrently and 
 * provides mechanisms for shared state access with proper
 * locking to avoid race conditions.
 */
import { Mutex } from '../primitives/Mutex';
import { CancellationToken, CancellationTokenSource } from '../utils/CancellationToken';
import { EventEmitter } from '../utils/EventEmitter';

// Type definitions
export type TaskId = string;
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskInfo<T = any> {
  id: TaskId;
  name: string;
  status: TaskStatus;
  result?: T;
  error?: Error;
  startTime?: number;
  endTime?: number;
  _taskFn?: (token: CancellationToken, getState: <K>(key: string) => Promise<K>, setState: <K>(key: string, value: K) => Promise<void>) => Promise<T>;
}

export interface TaskOptions {
  id?: TaskId;
  name?: string;
  cancellationToken?: CancellationToken;
}

export interface TaskEvents<T = any> {
  taskAdded: TaskInfo<T>;
  taskStarted: TaskInfo<T>;
  taskCompleted: TaskInfo<T> & { result: T };
  taskFailed: TaskInfo<T> & { error: Error };
  taskCancelled: TaskInfo<T>;
  stateChanged: Record<string, any>;
}

/**
 * Task Manager that manages concurrent tasks and provides thread-safe 
 * access to shared state.
 */
export class TaskManager<T = any> {
  private tasks: Map<TaskId, TaskInfo<T>> = new Map();
  private taskQueue: TaskId[] = [];
  private runningTasks: Set<TaskId> = new Set();
  private sharedState: Record<string, any> = {};
  private readonly maxConcurrency: number;
  private readonly stateMutex: Mutex = new Mutex();
  private readonly tasksMutex: Mutex = new Mutex();
  private readonly events: EventEmitter<TaskEvents<T>> = new EventEmitter();
  private readonly cancellationSources: Map<TaskId, CancellationTokenSource> = new Map();
  
  /**
   * Creates a new TaskManager
   * @param maxConcurrency Maximum number of tasks to run concurrently
   */
  constructor(maxConcurrency: number = 4) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new Error('maxConcurrency must be a positive integer');
    }
    this.maxConcurrency = maxConcurrency;
  }
  
  /**
   * Adds a task to be executed
   * @param taskFn The task function to execute
   * @param options Task options
   * @returns The task ID
   */
  async addTask(
    taskFn: (token: CancellationToken, getState: <K>(key: string) => Promise<K>, setState: <K>(key: string, value: K) => Promise<void>) => Promise<T>,
    options: TaskOptions = {}
  ): Promise<TaskId> {
    await this.tasksMutex.acquire();
    
    try {
      const id = options.id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const name = options.name || `Task ${id}`;
      
      // Create cancellation token if not provided
      const cancellationSource = options.cancellationToken 
        ? new CancellationTokenSource() // We'll link the provided token later
        : new CancellationTokenSource();
      
      this.cancellationSources.set(id, cancellationSource);
      
      // Link with provided token if any
      if (options.cancellationToken) {
        options.cancellationToken.register(() => {
          this.cancelTask(id);
        });
      }
      
      const taskInfo: TaskInfo<T> = {
        id,
        name,
        status: 'pending',
        _taskFn: taskFn
      };
      
      this.tasks.set(id, taskInfo);
      this.taskQueue.push(id);
      
      // Create a clean version of taskInfo without the function for event emission
      const eventTaskInfo = {
        id: taskInfo.id,
        name: taskInfo.name,
        status: taskInfo.status
      };
      
      this.events.emit('taskAdded', eventTaskInfo);
      
      // Try to start executing tasks
      this.scheduleTasks();
      
      return id;
    } finally {
      this.tasksMutex.release();
    }
  }
  
  /**
   * Schedules pending tasks for execution
   */
  private async scheduleTasks(): Promise<void> {
    await this.tasksMutex.acquire();
    
    try {
      // While we have capacity and pending tasks
      while (this.runningTasks.size < this.maxConcurrency && this.taskQueue.length > 0) {
        const taskId = this.taskQueue.shift();
        if (taskId) {
          this.executeTask(taskId);
        }
      }
    } finally {
      this.tasksMutex.release();
    }
  }
  
  /**
   * Executes a specific task
   * @param taskId The ID of the task to execute
   */
  private async executeTask(taskId: TaskId): Promise<void> {
    const taskInfo = this.tasks.get(taskId);
    const cancellationSource = this.cancellationSources.get(taskId);
    
    if (!taskInfo || !cancellationSource) {
      console.error(`Task ${taskId} not found`);
      return;
    }
    
    if (taskInfo.status !== 'pending') {
      return; // Task is already running, completed, or cancelled
    }
    
    await this.tasksMutex.acquire();
    
    try {
      // Mark task as running
      this.runningTasks.add(taskId);
      taskInfo.status = 'running';
      taskInfo.startTime = Date.now();
      
      this.events.emit('taskStarted', { ...taskInfo });
    } finally {
      this.tasksMutex.release();
    }
    
    try {
      // Get the original task function from the worker function map
      // We're using closures here to expose state manipulation with proper locking
      const token = cancellationSource.getToken();
      
      if (!taskInfo._taskFn) {
        throw new Error(`Task function not found for task ${taskId}`);
      }
      
      // Execute the task with access to shared state
      const result = await (async (fn) => {
        // getState and setState provide mutex-protected access to shared state
        const getState = async <K>(key: string): Promise<K> => {
          return this.getSharedState<K>(key);
        };
        
        const setState = async <K>(key: string, value: K): Promise<void> => {
          await this.setSharedState<K>(key, value);
        };
        
        return fn(token, getState, setState);
      })(taskInfo._taskFn);
      
      // Task completed successfully
      await this.tasksMutex.acquire();
      
      try {
        taskInfo.status = 'completed';
        taskInfo.result = result;
        taskInfo.endTime = Date.now();
        this.runningTasks.delete(taskId);
        
        this.events.emit('taskCompleted', { ...taskInfo, result });
        
        // Clean up cancellation source
        this.cancellationSources.delete(taskId);
        
        // Schedule next tasks
        this.scheduleTasks();
      } finally {
        this.tasksMutex.release();
      }
    } catch (error) {
      if (cancellationSource.cancelled) {
        // Task was cancelled
        await this.tasksMutex.acquire();
        
        try {
          taskInfo.status = 'cancelled';
          taskInfo.endTime = Date.now();
          this.runningTasks.delete(taskId);
          
          this.events.emit('taskCancelled', { ...taskInfo });
          
          // Clean up cancellation source
          this.cancellationSources.delete(taskId);
          
          // Schedule next tasks
          this.scheduleTasks();
        } finally {
          this.tasksMutex.release();
        }
      } else {
        // Task failed with an error
        await this.tasksMutex.acquire();
        
        try {
          taskInfo.status = 'failed';
          taskInfo.error = error instanceof Error ? error : new Error(String(error));
          taskInfo.endTime = Date.now();
          this.runningTasks.delete(taskId);
          
          this.events.emit('taskFailed', { ...taskInfo, error: taskInfo.error });
          
          // Clean up cancellation source
          this.cancellationSources.delete(taskId);
          
          // Schedule next tasks
          this.scheduleTasks();
        } finally {
          this.tasksMutex.release();
        }
      }
    }
  }
  
  /**
   * Gets the current value of a shared state key
   * @param key The state key
   * @returns The state value
   */
  private async getSharedState<K>(key: string): Promise<K> {
    return this.stateMutex.withLock(() => {
      return this.sharedState[key] as K;
    });
  }
  
  /**
   * Sets the value of a shared state key
   * @param key The state key
   * @param value The state value
   */
  private async setSharedState<K>(key: string, value: K): Promise<void> {
    await this.stateMutex.withLock(async () => {
      this.sharedState[key] = value;
      this.events.emit('stateChanged', { ...this.sharedState });
    });
  }
  
  /**
   * Safely reads from shared state with proper locking
   * @param key The state key to read
   * @returns The state value
   */
  async getState<K>(key: string): Promise<K | undefined> {
    return this.stateMutex.withLock(() => {
      return this.sharedState[key] as K | undefined;
    });
  }
  
  /**
   * Safely writes to shared state with proper locking
   * @param key The state key to write
   * @param value The state value
   */
  async setState<K>(key: string, value: K): Promise<void> {
    await this.stateMutex.withLock(async () => {
      this.sharedState[key] = value;
      this.events.emit('stateChanged', { ...this.sharedState });
    });
  }
  
  /**
   * Updates shared state with a function that receives the current state
   * @param key The state key
   * @param updateFn Function that receives current value and returns new value
   */
  async updateState<K>(key: string, updateFn: (currentValue: K | undefined) => K): Promise<K> {
    return this.stateMutex.withLock(async () => {
      const currentValue = this.sharedState[key] as K | undefined;
      const newValue = updateFn(currentValue);
      this.sharedState[key] = newValue;
      this.events.emit('stateChanged', { ...this.sharedState });
      return newValue;
    });
  }
  
  /**
   * Gets information about a task
   * @param taskId The task ID
   * @returns The task information, or undefined if not found
   */
  async getTaskInfo(taskId: TaskId): Promise<TaskInfo<T> | undefined> {
    await this.tasksMutex.acquire();
    
    try {
      const taskInfo = this.tasks.get(taskId);
      return taskInfo ? { ...taskInfo } : undefined;
    } finally {
      this.tasksMutex.release();
    }
  }
  
  /**
   * Gets information about all tasks
   * @returns Array of task information objects
   */
  async getAllTasks(): Promise<TaskInfo<T>[]> {
    await this.tasksMutex.acquire();
    
    try {
      return Array.from(this.tasks.values()).map(task => ({ ...task }));
    } finally {
      this.tasksMutex.release();
    }
  }
  
  /**
   * Cancels a running or pending task
   * @param taskId The task ID
   */
  async cancelTask(taskId: TaskId): Promise<boolean> {
    const cancellationSource = this.cancellationSources.get(taskId);
    
    if (!cancellationSource) {
      return false;
    }
    
    await this.tasksMutex.acquire();
    
    try {
      const taskInfo = this.tasks.get(taskId);
      
      if (!taskInfo || taskInfo.status !== 'running' && taskInfo.status !== 'pending') {
        return false;
      }
      
      // If task is pending, remove from queue
      if (taskInfo.status === 'pending') {
        const index = this.taskQueue.indexOf(taskId);
        if (index !== -1) {
          this.taskQueue.splice(index, 1);
        }
        
        taskInfo.status = 'cancelled';
        taskInfo.endTime = Date.now();
        
        this.events.emit('taskCancelled', { ...taskInfo });
      }
      
      // Cancel the task
      cancellationSource.cancel();
      
      return true;
    } finally {
      this.tasksMutex.release();
    }
  }
  
  /**
   * Cancels all running and pending tasks
   */
  async cancelAllTasks(): Promise<void> {
    await this.tasksMutex.acquire();
    
    try {
      // Cancel all pending tasks
      for (const taskId of this.taskQueue) {
        const taskInfo = this.tasks.get(taskId);
        const cancellationSource = this.cancellationSources.get(taskId);
        
        if (taskInfo && cancellationSource) {
          taskInfo.status = 'cancelled';
          taskInfo.endTime = Date.now();
          
          this.events.emit('taskCancelled', { ...taskInfo });
          cancellationSource.cancel();
        }
      }
      
      // Clear the queue
      this.taskQueue = [];
      
      // Cancel all running tasks
      for (const taskId of this.runningTasks) {
        const cancellationSource = this.cancellationSources.get(taskId);
        
        if (cancellationSource) {
          cancellationSource.cancel();
        }
      }
    } finally {
      this.tasksMutex.release();
    }
  }
  
  /**
   * Subscribes to task events
   * @param event The event name
   * @param handler The event handler
   * @returns A function to unsubscribe
   */
  on<E extends keyof TaskEvents<T>>(event: E, handler: (payload: TaskEvents<T>[E]) => void): () => void {
    this.events.on(event, handler);
    return () => this.events.off(event, handler);
  }
  
  /**
   * Gets the current concurrency level
   */
  get concurrencyLevel(): number {
    return this.maxConcurrency;
  }
  
  /**
   * Gets the current number of running tasks
   */
  get runningTaskCount(): number {
    return this.runningTasks.size;
  }
  
  /**
   * Gets the current number of pending tasks
   */
  get pendingTaskCount(): number {
    return this.taskQueue.length;
  }
  
  /**
   * Gets a copy of the current shared state
   */
  async getFullState(): Promise<Record<string, any>> {
    return this.stateMutex.withLock(() => {
      return { ...this.sharedState };
    });
  }
} 