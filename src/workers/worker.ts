/**
 * Worker script for WorkerPool
 * 
 * This file is executed by the worker_threads module.
 * It handles tasks sent from the main thread, processes them,
 * and returns the results.
 */
import { parentPort } from 'worker_threads';

if (!parentPort) {
  throw new Error('This script must be run as a worker thread!');
}

// Signal that the worker is ready
parentPort.postMessage({ type: 'ready' });

// Handle incoming tasks
parentPort.on('message', async (task) => {
  try {
    if (!task || !task.id || task.data === undefined) {
      throw new Error('Invalid task format');
    }

    const { id, data } = task;
    
    // Process the task data
    // This is where your actual task processing logic goes
    // For demonstration purposes, we'll just echo the data
    // with a slight delay to simulate processing time
    const result = await processTask(data);
    
    // Send the result back to the main thread
    parentPort!.postMessage({
      type: 'result',
      taskId: id,
      result
    });
  } catch (error) {
    // Send the error back to the main thread
    parentPort!.postMessage({
      type: 'error',
      taskId: task?.id,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Process the task data (this is where your task processing logic would go)
 * @param data The data to process
 * @returns The processed result
 */
async function processTask<T>(data: T): Promise<T> {
  // Simulate some processing time
  await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  
  // In a real application, you would do actual processing here
  // For example: data manipulation, calculations, API calls, etc.
  
  return data; // Echo back the data for demonstration
}

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in worker:', error);
  
  // Notify the main thread about the error
  if (parentPort) {
    parentPort.postMessage({
      type: 'error',
      error: error.message
    });
  }
  
  // Exit gracefully
  process.exit(1);
}); 