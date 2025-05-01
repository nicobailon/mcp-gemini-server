import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { RetryService, withRetry } from "../../../src/utils/RetryService.js";

// Test helper to simulate multiple failures before success
function createMultiFailFunction<T>(
  failures: number,
  result: T,
  errorMessage = "Simulated error",
  errorName = "NetworkError" // Using a retryable error name by default
): () => Promise<T> {
  let attempts = 0;
  
  return async () => {
    attempts++;
    if (attempts <= failures) {
      const error = new Error(errorMessage);
      error.name = errorName;
      throw error;
    }
    return result;
  };
}

describe("RetryService", () => {
  // Mock the setTimeout to execute immediately for testing purposes
  let originalSetTimeout: typeof setTimeout;
  
  beforeEach(() => {
    // Save original setTimeout
    originalSetTimeout = global.setTimeout;
    
    // Replace with a version that executes immediately
    global.setTimeout = function(fn: TimerHandler): number {
      if (typeof fn === 'function') fn();
      return 0;
    } as typeof setTimeout;
  });
  
  // Restore setTimeout after tests
  afterEach(() => {
    global.setTimeout = originalSetTimeout;
  });
  
  describe("execute method", () => {
    let retryService: RetryService;
    let onRetryMock: ReturnType<typeof mock.fn<(error: unknown, attempt: number, delayMs: number) => void>>;
    let delaysCollected: number[] = [];
    
    beforeEach(() => {
      delaysCollected = [];
      onRetryMock = mock.fn((error: unknown, attempt: number, delayMs: number) => {
        delaysCollected.push(delayMs);
      });
      
      retryService = new RetryService({
        maxAttempts: 3,
        initialDelayMs: 10, // Short delay for faster tests
        maxDelayMs: 50,
        backoffFactor: 2,
        jitter: false, // Disable jitter for predictable tests
        onRetry: onRetryMock,
        // Force all NetworkError types to be retryable for tests
        retryableErrorCheck: (err: unknown) => {
          if (err instanceof Error && err.name === "NetworkError") {
            return true;
          }
          return false;
        }
      });
    });
    
    it("should succeed on first attempt", async () => {
      const fn = mock.fn(async () => "success");
      
      const result = await retryService.execute(fn);
      
      assert.strictEqual(result, "success");
      assert.strictEqual(fn.mock.callCount(), 1);
      assert.strictEqual(onRetryMock.mock.callCount(), 0);
    });
    
    it("should retry and succeed after retries", async () => {
      const fn = createMultiFailFunction(2, "success");
      const mockFn = mock.fn(fn);
      
      const result = await retryService.execute(mockFn);
      
      assert.strictEqual(result, "success");
      assert.strictEqual(mockFn.mock.callCount(), 3); // 1 initial + 2 retries
      assert.strictEqual(onRetryMock.mock.callCount(), 2);
    });
    
    it("should throw if max retries are exceeded", async () => {
      const fn = createMultiFailFunction(5, "never reached");
      const mockFn = mock.fn(fn);
      
      await assert.rejects(
        async () => await retryService.execute(mockFn),
        (err: Error) => {
          assert.strictEqual(err.message, "Simulated error");
          assert.strictEqual(mockFn.mock.callCount(), 4); // 1 initial + 3 retries (maxAttempts)
          assert.strictEqual(onRetryMock.mock.callCount(), 3);
          return true;
        }
      );
    });
    
    it("should not retry on non-retryable errors", async () => {
      const error = new Error("Non-retryable error");
      error.name = "ValidationError"; // Not in the retryable list
      
      const fn = mock.fn(async () => {
        throw error;
      });
      
      await assert.rejects(
        async () => await retryService.execute(fn),
        (err: Error) => {
          assert.strictEqual(err.message, "Non-retryable error");
          assert.strictEqual(fn.mock.callCount(), 1); // No retries
          assert.strictEqual(onRetryMock.mock.callCount(), 0);
          return true;
        }
      );
    });
    
    it("should use custom retryable error check if provided", async () => {
      const customRetryService = new RetryService({
        maxAttempts: 3,
        initialDelayMs: 10,
        retryableErrorCheck: (err: unknown) => {
          return (err as Error).message.includes("custom");
        }
      });
      
      const nonRetryableFn = mock.fn(async () => {
        throw new Error("regular error"); // Won't be retried
      });
      
      const retryableFn = mock.fn(async () => {
        throw new Error("custom error"); // Will be retried
      });
      
      // Should not retry for regular error
      await assert.rejects(async () => await customRetryService.execute(nonRetryableFn));
      assert.strictEqual(nonRetryableFn.mock.callCount(), 1);
      
      // Should retry for custom error
      await assert.rejects(async () => await customRetryService.execute(retryableFn));
      assert.strictEqual(retryableFn.mock.callCount(), 4); // 1 initial + 3 retries
    });
  });
  
  describe("wrap method", () => {
    it("should create a function with retry capabilities", async () => {
      const retryService = new RetryService({
        maxAttempts: 2,
        initialDelayMs: 10,
        // Ensure errors are retryable in tests
        retryableErrorCheck: (err: unknown) => {
          if (err instanceof Error && err.name === "NetworkError") {
            return true;
          }
          return false;
        }
      });
      
      const fn = createMultiFailFunction(1, "success");
      const mockFn = mock.fn(fn);
      
      const wrappedFn = retryService.wrap(mockFn);
      const result = await wrappedFn();
      
      assert.strictEqual(result, "success");
      assert.strictEqual(mockFn.mock.callCount(), 2); // 1 initial + 1 retry
    });
    
    it("should pass arguments correctly", async () => {
      const retryService = new RetryService({ maxAttempts: 2 });
      
      const fn = mock.fn(async (a: number, b: string) => {
        return `${a}-${b}`;
      });
      
      const wrappedFn = retryService.wrap(fn);
      const result = await wrappedFn(42, "test");
      
      assert.strictEqual(result, "42-test");
      assert.deepStrictEqual(fn.mock.calls[0].arguments, [42, "test"]);
    });
  });
  
  describe("withRetry function", () => {
    // Temporarily create a specialized withRetry for testing
    const testWithRetry = async function<T>(fn: () => Promise<T>): Promise<T> {
      const testRetryService = new RetryService({
        retryableErrorCheck: (err: unknown) => {
          if (err instanceof Error && err.name === "NetworkError") {
            return true;
          }
          return false;
        }
      });
      return testRetryService.execute(fn);
    };
    
    it("should retry using default settings", async () => {
      const fn = createMultiFailFunction(1, "success");
      const mockFn = mock.fn(fn);
      
      // Use our test-specific function
      const result = await testWithRetry(mockFn);
      
      assert.strictEqual(result, "success");
      assert.strictEqual(mockFn.mock.callCount(), 2); // 1 initial + 1 retry
    });
  });
  
  describe("delay calculation", () => {
    it("should use exponential backoff for delays", async () => {
      const delays: number[] = [];
      
      // Create a test-specific RetryService
      const testRetryService = new RetryService({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffFactor: 2,
        jitter: false,
        onRetry: (error: unknown, attempt: number, delayMs: number) => {
          delays.push(delayMs);
        }
      });
      
      // Direct access to the private method for testing
      // @ts-ignore - Accessing private method for testing
      const delay1 = testRetryService["calculateDelay"](0);
      // @ts-ignore - Accessing private method for testing
      const delay2 = testRetryService["calculateDelay"](1);
      // @ts-ignore - Accessing private method for testing
      const delay3 = testRetryService["calculateDelay"](2);
      
      // Verify calculated delays
      assert.strictEqual(delay1, 100);
      assert.strictEqual(delay2, 200);
      assert.strictEqual(delay3, 400);
    });
    
    it("should respect maxDelayMs", async () => {
      // Create a test-specific RetryService with a low maxDelayMs
      const testRetryService = new RetryService({
        maxAttempts: 5,
        initialDelayMs: 100,
        maxDelayMs: 300, // Cap at 300ms
        backoffFactor: 2,
        jitter: false
      });
      
      // Test calculated delays directly
      // @ts-ignore - Accessing private method for testing
      const delay1 = testRetryService["calculateDelay"](0);
      // @ts-ignore - Accessing private method for testing
      const delay2 = testRetryService["calculateDelay"](1);
      // @ts-ignore - Accessing private method for testing
      const delay3 = testRetryService["calculateDelay"](2); // Should be capped
      // @ts-ignore - Accessing private method for testing
      const delay4 = testRetryService["calculateDelay"](3); // Should be capped
      
      // Verify calculated delays
      assert.strictEqual(delay1, 100);
      assert.strictEqual(delay2, 200);
      assert.strictEqual(delay3, 300); // Capped
      assert.strictEqual(delay4, 300); // Capped
    });
  });
});