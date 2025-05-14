/**
 * WorkerPool implementation in TypeScript
 * 
 * Manages a pool of worker threads to process tasks in parallel.
 */
import * as os from 'os';
import * as path from 'path';
import { Worker, WorkerOptions } from 'worker_threads';

export interface Task<T = any, R = any> {
  id: string;
  data: T;
}

interface WorkerMessage<R = any> {
  type: 'result' | 'error' | 'ready';
  taskId?: string;
  result?: R;
  error?: string;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private workerScriptPath: string;
  private workerOptions: WorkerOptions;
  private taskQueue: Array<{
    task: Task;
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
  }> = [];
  private availableWorkers: Worker[] = [];
  private isTerminating = false;

  /**
   * Creates a new worker pool
   * @param workerScriptPath Path to the worker script file
   * @param numWorkers Number of workers to create (defaults to CPU count)
   * @param workerOptions Options to pass to each worker
   */
  constructor(
    workerScriptPath: string,
    numWorkers = os.cpus().length,
    workerOptions: WorkerOptions = {}
  ) {
    this.workerScriptPath = path.resolve(workerScriptPath);
    this.workerOptions = workerOptions;
    
    // Initialize workers
    for (let i = 0; i < numWorkers; i++) {
      this.addNewWorker();
    }
  }

  /**
   * Creates and initializes a new worker
   */
  private addNewWorker(): void {
    const worker = new Worker(this.workerScriptPath, this.workerOptions);
    
    worker.on('message', (message: WorkerMessage) => {
      if (message.type === 'ready') {
        // Worker is ready to process tasks
        this.handleAvailableWorker(worker);
      } else if (message.type === 'result' && message.taskId) {
        // Worker completed a task successfully
        this.resolveTask(message.taskId, message.result);
        this.handleAvailableWorker(worker);
      } else if (message.type === 'error' && message.taskId) {
        // Worker encountered an error
        this.rejectTask(message.taskId, new Error(message.error));
        this.handleAvailableWorker(worker);
      }
    });
    
    worker.on('error', (err) => {
      console.error('Worker error:', err);
      
      // Remove failed worker from the pool
      this.workers = this.workers.filter(w => w !== worker);
      this.availableWorkers = this.availableWorkers.filter(w => w !== worker);
      
      // Create a replacement worker if not terminating
      if (!this.isTerminating) {
        this.addNewWorker();
      }
    });
    
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker exited with code ${code}`);
      }
      
      // Remove exited worker from the pool
      this.workers = this.workers.filter(w => w !== worker);
      this.availableWorkers = this.availableWorkers.filter(w => w !== worker);
      
      // Create a replacement worker if not terminating
      if (!this.isTerminating) {
        this.addNewWorker();
      }
    });
    
    this.workers.push(worker);
  }

  /**
   * Handles a worker that has become available
   * @param worker The available worker
   */
  private handleAvailableWorker(worker: Worker): void {
    if (this.taskQueue.length > 0) {
      // Assign next task to worker
      const nextTask = this.taskQueue.shift()!;
      worker.postMessage(nextTask.task);
    } else {
      // No tasks, add worker to available workers
      this.availableWorkers.push(worker);
    }
  }

  /**
   * Resolves a task with its result
   * @param taskId ID of the task to resolve
   * @param result Result of the task
   */
  private resolveTask(taskId: string, result: any): void {
    const taskIndex = this.taskQueue.findIndex(item => item.task.id === taskId);
    if (taskIndex !== -1) {
      const task = this.taskQueue.splice(taskIndex, 1)[0];
      task.resolve(result);
    }
  }

  /**
   * Rejects a task with an error
   * @param taskId ID of the task to reject
   * @param error Error that occurred
   */
  private rejectTask(taskId: string, error: Error): void {
    const taskIndex = this.taskQueue.findIndex(item => item.task.id === taskId);
    if (taskIndex !== -1) {
      const task = this.taskQueue.splice(taskIndex, 1)[0];
      task.reject(error);
    }
  }

  /**
   * Executes a task in the worker pool
   * @param task Task to execute
   * @returns Promise that resolves with the task result
   */
  executeTask<T, R>(task: Task<T, R>): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      if (this.isTerminating) {
        reject(new Error('Worker pool is terminating'));
        return;
      }
      
      // Add task to queue
      this.taskQueue.push({ task, resolve, reject });
      
      // Assign task to a worker if available
      if (this.availableWorkers.length > 0) {
        const worker = this.availableWorkers.pop()!;
        const nextTask = this.taskQueue.shift()!;
        worker.postMessage(nextTask.task);
      }
    });
  }

  /**
   * Terminates all workers in the pool
   */
  async terminate(): Promise<void> {
    this.isTerminating = true;
    
    // Reject all pending tasks
    this.taskQueue.forEach(({ reject }) => {
      reject(new Error('Worker pool was terminated'));
    });
    this.taskQueue = [];
    
    // Terminate all workers
    const terminationPromises = this.workers.map(worker => worker.terminate());
    await Promise.all(terminationPromises);
    
    this.workers = [];
    this.availableWorkers = [];
  }

  /**
   * Returns the number of workers in the pool
   */
  get size(): number {
    return this.workers.length;
  }

  /**
   * Returns the number of idle workers
   */
  get idleWorkers(): number {
    return this.availableWorkers.length;
  }

  /**
   * Returns the number of busy workers
   */
  get busyWorkers(): number {
    return this.workers.length - this.availableWorkers.length;
  }
} 