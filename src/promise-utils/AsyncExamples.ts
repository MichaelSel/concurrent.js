/**
 * Advanced Asynchronous Programming Examples in TypeScript
 * 
 * This file contains examples of various asynchronous programming patterns
 */

/**
 * Demonstrates the difference between Promise.all and Promise.allSettled
 */
export async function allVsAllSettled(promises: Promise<any>[]): Promise<{
  all: { success: boolean; result?: any; error?: any };
  allSettled: { 
    fulfilled: { value: any }[];
    rejected: { reason: any }[];
  };
}> {
  // Promise.all stops at the first rejection
  let allResult;
  try {
    const result = await Promise.all(promises);
    allResult = { success: true, result };
  } catch (error) {
    allResult = { success: false, error };
  }
  
  // Promise.allSettled processes all promises regardless of their outcomes
  const allSettledResult = await Promise.allSettled(promises);
  
  const fulfilled = allSettledResult
    .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
    .map(result => ({ value: result.value }));
  
  const rejected = allSettledResult
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map(result => ({ reason: result.reason }));
  
  return {
    all: allResult,
    allSettled: { fulfilled, rejected }
  };
}

/**
 * Demonstrates the differences between queueMicrotask, setImmediate, and setTimeout
 * 
 * @param callback Function to call after each scheduling method completes
 */
export function schedulingDifferences(callback: (method: string, timeMs: number) => void): void {
  console.log('Main script execution started');
  
  const startTime = Date.now();
  const logTiming = (method: string) => {
    const elapsed = Date.now() - startTime;
    console.log(`${method}: executed after ${elapsed}ms`);
    callback(method, elapsed);
  };

  // setTimeout (macrotask queue, executed after the current task & microtasks)
  setTimeout(() => {
    logTiming('setTimeout(0)');
  }, 0);
  
  // setImmediate (Node.js specific, generally runs after I/O events but before timers)
  // Note: This is Node.js specific and not available in browsers
  if (typeof setImmediate === 'function') {
    setImmediate(() => {
      logTiming('setImmediate');
    });
  } else {
    console.log('setImmediate is not available in this environment');
  }
  
  // queueMicrotask (microtask queue, executed before the next task)
  queueMicrotask(() => {
    logTiming('queueMicrotask');
  });
  
  // Promise resolution (also uses microtask queue)
  Promise.resolve().then(() => {
    logTiming('Promise.resolve().then()');
  });
  
  console.log('Main script execution ended');
}

/**
 * Example of using Promise.any and Promise.race
 */
export async function raceAndAny(): Promise<{
  race: any;
  any: any;
}> {
  // Create some sample promises with different timings
  const fast = new Promise(resolve => setTimeout(() => resolve('Fast (50ms)'), 50));
  const medium = new Promise(resolve => setTimeout(() => resolve('Medium (150ms)'), 150));
  const slow = new Promise(resolve => setTimeout(() => resolve('Slow (300ms)'), 300));
  const failing = new Promise((_, reject) => setTimeout(() => reject(new Error('Failed promise')), 100));
  
  const promises = [fast, medium, slow, failing];
  
  // Promise.race returns the first settled promise (fulfilled or rejected)
  const raceResult = await Promise.race(promises)
    .catch(error => `Race caught: ${error.message}`);
  
  // Promise.any returns the first fulfilled promise, ignoring rejections unless all promises reject
  const anyResult = await Promise.any(promises)
    .catch(error => `Any caught: ${error.message}`);
  
  return { race: raceResult, any: anyResult };
} 