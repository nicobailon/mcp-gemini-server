import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { McpClientService } from "../../../../src/services/mcp/McpClientService.js";
import {
  McpError as SdkMcpError,
  ErrorCode
} from "@modelcontextprotocol/sdk/types.js";

// Import the modules we need to mock
import EventSource from "eventsource";
import * as uuid from "uuid";
import * as childProcess from "child_process";
import * as fetchModule from "node-fetch";
import { logger } from "../../../../src/utils/logger.js";

// Fixed UUID for testing
const TEST_UUID = "test-uuid-value";

// Mock EventSource
vi.mock("eventsource", () => {
  const mockEventSource = {
    close: vi.fn(),
    readyState: 0, // CONNECTING
    onopen: null,
    onmessage: null,
    onerror: null,
  };

  // Create the constructor function
  const MockEventSource = vi.fn(() => mockEventSource) as unknown as {
    (): typeof mockEventSource;
    CONNECTING: number;
    OPEN: number;
    CLOSED: number;
  };
  
  // Add static properties
  MockEventSource.CONNECTING = 0;
  MockEventSource.OPEN = 1;
  MockEventSource.CLOSED = 2;

  return {
    default: MockEventSource
  };
});

// Mock child_process
vi.mock("child_process", () => {
  const mockStdout = {
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  };

  const mockStderr = {
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  };

  const mockStdin = {
    write: vi.fn(),
  };

  const mockChildProcess = {
    stdout: mockStdout,
    stderr: mockStderr,
    stdin: mockStdin,
    on: vi.fn(),
    kill: vi.fn(),
    removeAllListeners: vi.fn(),
  };

  return {
    spawn: vi.fn(() => mockChildProcess),
    // Expose the mocks for test access
    __mocks: {
      childProcess: mockChildProcess,
      stdout: mockStdout,
      stderr: mockStderr,
      stdin: mockStdin
    }
  };
});

// Mock uuid
vi.mock("uuid", () => {
  return {
    v4: vi.fn(() => "test-uuid-value")
  };
});

// Mock fetch
vi.mock("node-fetch", () => {
  const mockFetchResponse = {
    ok: true,
    status: 200,
    statusText: "OK",
    json: vi.fn().mockResolvedValue({ result: {} })
  };

  return {
    default: vi.fn(() => Promise.resolve(mockFetchResponse)),
    __response: mockFetchResponse
  };
});

// Access the mocks
// Define the EventSource mock type properly
const mockEventSourceType = (EventSource as any).default as {
  (url: string): {
    close: ReturnType<typeof vi.fn>;
    readyState: number;
    onopen: null;
    onmessage: null;
    onerror: null;
  };
  CONNECTING: number;
  OPEN: number;
  CLOSED: number;
};
const mockEventSource = mockEventSourceType;
const mockEventSourceInstance = (EventSource as any)();
const { __mocks: { childProcess: mockChildProcess, stdout: mockStdout, stderr: mockStderr, stdin: mockStdin } } = childProcess as any;
const mockSpawn = childProcess.spawn as ReturnType<typeof vi.fn>;
const mockUuidv4 = uuid.v4 as ReturnType<typeof vi.fn>;
const mockFetch = fetchModule.default as ReturnType<typeof vi.fn>;
const mockFetchResponse = (fetchModule as any).__response;

describe("McpClientService", () => {
  let service: McpClientService;
  let originalSetInterval: typeof global.setInterval;
  let originalClearInterval: typeof global.clearInterval;

  beforeEach(() => {
    // Save original timing functions
    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;
    
    // Mock timers
    vi.useFakeTimers();
    
    // Mock logger
    vi.spyOn(logger, 'info').mockImplementation(vi.fn());
    vi.spyOn(logger, 'warn').mockImplementation(vi.fn());
    vi.spyOn(logger, 'error').mockImplementation(vi.fn());
    vi.spyOn(logger, 'debug').mockImplementation(vi.fn());
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create a new instance of the service
    service = new McpClientService();
  });

  afterEach(() => {
    // Restore originals
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    
    // Restore all mocks
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("Constructor", () => {
    it("should initialize with empty connection maps", () => {
      expect((service as any).activeSseConnections.size).toBe(0);
      expect((service as any).activeStdioConnections.size).toBe(0);
      expect((service as any).pendingStdioRequests.size).toBe(0);
    });
    
    it("should set up a cleanup interval", () => {
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });
  });

  describe("connect", () => {
    it("should validate serverId properly", async () => {
      await expect(service.connect("", { type: "sse", sseUrl: "http://test-url.com" }))
        .rejects.toThrow(SdkMcpError);
      await expect(service.connect("", { type: "sse", sseUrl: "http://test-url.com" }))
        .rejects.toThrow(/Server ID must be a non-empty string/);
    });
    
    it("should validate connection details properly", async () => {
      // @ts-ignore - Testing invalid input
      await expect(service.connect("server1", null))
        .rejects.toThrow(SdkMcpError);
      // @ts-ignore - Testing invalid input
      await expect(service.connect("server1", null))
        .rejects.toThrow(/Connection details must be an object/);
    });
    
    it("should validate connection type properly", async () => {
      // @ts-ignore - Testing invalid input
      await expect(service.connect("server1", { type: "invalid" }))
        .rejects.toThrow(SdkMcpError);
      // @ts-ignore - Testing invalid input
      await expect(service.connect("server1", { type: "invalid" }))
        .rejects.toThrow(/Connection type must be 'sse' or 'stdio'/);
    });
    
    it("should validate SSE URL properly", async () => {
      await expect(service.connect("server1", { type: "sse", sseUrl: "" }))
        .rejects.toThrow(SdkMcpError);
      await expect(service.connect("server1", { type: "sse", sseUrl: "" }))
        .rejects.toThrow(/sseUrl must be a non-empty string/);
      
      await expect(service.connect("server1", { type: "sse", sseUrl: "invalid-url" }))
        .rejects.toThrow(SdkMcpError);
      await expect(service.connect("server1", { type: "sse", sseUrl: "invalid-url" }))
        .rejects.toThrow(/valid URL format/);
    });
    
    it("should validate stdio command properly", async () => {
      await expect(service.connect("server1", { type: "stdio", stdioCommand: "" }))
        .rejects.toThrow(SdkMcpError);
      await expect(service.connect("server1", { type: "stdio", stdioCommand: "" }))
        .rejects.toThrow(/stdioCommand must be a non-empty string/);
    });
    
    it("should establish an SSE connection successfully", async () => {
      const connectPromise = service.connect(
        "server1", 
        { type: "sse", sseUrl: "http://test-server.com/sse" }
      );
      
      // Simulate successful connection
      mockEventSourceInstance.onopen();
      
      const connectionId = await connectPromise;
      
      expect(connectionId).toBe("test-uuid-value");
      expect((service as any).activeSseConnections.size).toBe(1);
      
      // Check correct parameters were used
      expect(mockEventSource).toHaveBeenCalledWith("http://test-server.com/sse");
    });
    
    it("should establish a stdio connection successfully", async () => {
      const connectionId = await service.connect(
        "server1", 
        { 
          type: "stdio",
          stdioCommand: "test-command",
          stdioArgs: ["arg1", "arg2"],
        }
      );
      
      expect(connectionId).toBe("test-uuid-value");
      expect((service as any).activeStdioConnections.size).toBe(1);
      
      // Check correct parameters were used
      expect(mockSpawn).toHaveBeenCalledWith(
        "test-command",
        ["arg1", "arg2"],
        expect.anything()
      );
    });
  });

  describe("cleanupStaleConnections", () => {
    it("should close stale SSE connections", async () => {
      // Create a connection
      const connectPromise = (service as any).connectSse("http://test-server.com/sse");
      mockEventSourceInstance.onopen();
      const connectionId = await connectPromise;
      
      // Verify connection exists
      expect((service as any).activeSseConnections.size).toBe(1);
      
      // Set the last activity timestamp to be stale (10 minutes + 1 second ago)
      const staleTimestamp = Date.now() - (600000 + 1000);
      (service as any).activeSseConnections.get(connectionId).lastActivityTimestamp = staleTimestamp;
      
      // Call the cleanup method
      (service as any).cleanupStaleConnections();
      
      // Verify connection was closed
      expect(mockEventSourceInstance.close).toHaveBeenCalled();
      expect((service as any).activeSseConnections.size).toBe(0);
    });
    
    it("should close stale stdio connections", async () => {
      // Create a connection
      const connectionId = await (service as any).connectStdio("test-command");
      
      // Verify connection exists
      expect((service as any).activeStdioConnections.size).toBe(1);
      
      // Set the last activity timestamp to be stale (10 minutes + 1 second ago)
      const staleTimestamp = Date.now() - (600000 + 1000);
      (service as any).activeStdioConnections.get(connectionId).lastActivityTimestamp = staleTimestamp;
      
      // Call the cleanup method
      (service as any).cleanupStaleConnections();
      
      // Verify connection was closed
      expect(mockChildProcess.kill).toHaveBeenCalled();
      expect((service as any).activeStdioConnections.size).toBe(0);
    });
    
    it("should not close active connections", async () => {
      // Create a connection
      const connectPromise = (service as any).connectSse("http://test-server.com/sse");
      mockEventSourceInstance.onopen();
      await connectPromise;
      
      // Verify connection exists (with current timestamp)
      expect((service as any).activeSseConnections.size).toBe(1);
      
      // Call the cleanup method
      (service as any).cleanupStaleConnections();
      
      // Verify connection was not closed
      expect(mockEventSourceInstance.close).not.toHaveBeenCalled();
      expect((service as any).activeSseConnections.size).toBe(1);
    });
  });

  describe("SSE Connections", () => {
    const testUrl = "http://test-server.com/sse";
    
    it("should create an EventSource and return a connection ID when successful", async () => {
      const connectPromise = (service as any).connectSse(testUrl);
      
      // Trigger the onopen event to simulate successful connection
      mockEventSourceInstance.onopen();
      
      const connectionId = await connectPromise;
      
      // Check EventSource was constructed with the correct URL
      expect(mockEventSource).toHaveBeenCalledWith(testUrl);
      
      // Check the connection ID is returned
      expect(connectionId).toBe("test-uuid-value");
      
      // Check the connection was stored with last activity timestamp
      expect((service as any).activeSseConnections.size).toBe(1);
      expect((service as any).activeSseConnections.has("test-uuid-value")).toBe(true);
      
      const connection = (service as any).activeSseConnections.get("test-uuid-value");
      expect(connection.lastActivityTimestamp).toBeGreaterThan(0);
    });

    it("should handle SSE messages and pass them to the messageHandler", async () => {
      const messageHandler = vi.fn();
      const testData = { foo: "bar" };
      
      const connectPromise = (service as any).connectSse(testUrl, messageHandler);
      // Manually trigger the onopen callback to resolve the connection promise
      mockEventSourceInstance.onopen();
      await connectPromise;
      
      // Get the initial activity timestamp
      const initialTimestamp = (service as any).activeSseConnections.get("test-uuid-value").lastActivityTimestamp;
      
      // Store original timestamp so we can mock a newer one
      const originalTimestamp = Date.now;
      // Mock Date.now to return a later timestamp
      Date.now = vi.fn().mockReturnValue(initialTimestamp + 1000);
      
      // Trigger the onmessage event with test data
      const messageEvent = { data: JSON.stringify(testData) };
      mockEventSourceInstance.onmessage(messageEvent);
      
      // Verify message handler was called with parsed data
      expect(messageHandler).toHaveBeenCalledWith(testData);
      
      // Verify last activity timestamp was updated
      const newTimestamp = (service as any).activeSseConnections.get("test-uuid-value").lastActivityTimestamp;
      expect(newTimestamp).toBeGreaterThan(initialTimestamp);
      
      // Restore original Date.now
      Date.now = originalTimestamp;
    }, 10000);

    it("should handle SSE message parse errors and pass raw data to the messageHandler", async () => {
      const messageHandler = vi.fn();
      const invalidJson = "{ not valid json";
      
      const connectPromise = (service as any).connectSse(testUrl, messageHandler);
      // Manually trigger the onopen callback to resolve the connection promise
      mockEventSourceInstance.onopen();
      await connectPromise;
      
      // Store original timestamp and mock it
      const originalTimestamp = Date.now;
      Date.now = vi.fn().mockReturnValue(Date.now() + 1000);
      
      // Trigger the onmessage event with invalid JSON
      const messageEvent = { data: invalidJson };
      mockEventSourceInstance.onmessage(messageEvent);
      
      // Verify message handler was called with raw data
      expect(messageHandler).toHaveBeenCalledWith(invalidJson);
      
      // Restore original Date.now
      Date.now = originalTimestamp;
    }, 10000);

    it("should reject the promise when an SSE error occurs before connection", async () => {
      const connectPromise = (service as any).connectSse(testUrl);
      
      // Trigger the onerror event before onopen
      const errorEvent = { type: "error", message: "Connection failed" };
      mockEventSourceInstance.onerror(errorEvent);
      
      // Expect the promise to reject
      await expect(connectPromise).rejects.toThrow(SdkMcpError);
      await expect(connectPromise).rejects.toThrow(/Failed to establish SSE connection/);
      
      // Verify no connection was stored
      expect((service as any).activeSseConnections.size).toBe(0);
    });

    it("should close and remove the connection when an SSE error occurs after connection", async () => {
      // Successfully connect first
      const connectPromise = (service as any).connectSse(testUrl);
      mockEventSourceInstance.onopen();
      const connectionId = await connectPromise;
      
      // Verify connection exists before error
      expect((service as any).activeSseConnections.size).toBe(1);
      expect((service as any).activeSseConnections.has(connectionId)).toBe(true);
      
      // Update readyState to simulate a connected then closed state
      mockEventSourceInstance.readyState = mockEventSource.CLOSED;
      
      // Trigger an error after successful connection
      const errorEvent = { type: "error", message: "Connection lost" };
      mockEventSourceInstance.onerror(errorEvent);
      
      // Verify connection was removed
      expect((service as any).activeSseConnections.size).toBe(0);
      expect((service as any).activeSseConnections.has(connectionId)).toBe(false);
    }, 10000);
    
    it("should close an SSE connection on disconnect", async () => {
      // Reset mocks before this test to ensure clean state
      vi.clearAllMocks();
      service = new McpClientService();
      
      // In this test we're going to directly set up the activeSseConnections map to match the test scenario
      // This is necessary because the implementation uses the connectionId for storage and lookup
      const connectionId = TEST_UUID;
      const serverId = connectionId; // In the real implementation, the serverId is used as the connection key
      
      // Manually set up the connection in the map
      (service as any).activeSseConnections.set(serverId, {
        eventSource: mockEventSourceInstance,
        baseUrl: testUrl,
        lastActivityTimestamp: Date.now()
      });
      
      // Verify connection exists before disconnecting
      expect((service as any).activeSseConnections.size).toBe(1);
      expect((service as any).activeSseConnections.has(serverId)).toBe(true);
      
      // Disconnect
      const result = service.disconnect(serverId);
      
      // Verify connection was closed
      expect(result).toBe(true);
      expect(mockEventSourceInstance.close).toHaveBeenCalled();
      expect((service as any).activeSseConnections.size).toBe(0);
    }, 10000);
    
    it("should throw an error when disconnecting from a non-existent connection", () => {
      expect(() => service.disconnect("non-existent-server"))
        .toThrow(SdkMcpError);
      expect(() => service.disconnect("non-existent-server"))
        .toThrow(/Connection not found/);
    });
  });

  // Additional tests for callTool, listTools, etc. would follow the same pattern
});