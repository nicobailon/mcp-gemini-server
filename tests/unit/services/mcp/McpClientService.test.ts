import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { McpClientService } from "../../../../src/services/mcp/McpClientService.js";

// Mock the required dependencies
import EventSource from "eventsource";
import { ChildProcess } from "child_process";
import * as uuid from "uuid";
import fetch from "node-fetch";

// Mock the logger
jest.mock("../../../../src/utils/logger.js", () => ({
  logger: {
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn(),
    debug: mock.fn(),
  },
}));

// Mock EventSource
const mockEventSource = {
  close: mock.fn(),
  readyState: 0, // CONNECTING
  onopen: null as any,
  onmessage: null as any,
  onerror: null as any,
};

const mockEventSourceConstructor = mock.fn(() => mockEventSource);
// @ts-ignore - We're mocking the module import
EventSource = mockEventSourceConstructor as any;

// Mock EventSource static properties
// @ts-ignore - Adding properties to our mock
EventSource.CONNECTING = 0;
// @ts-ignore - Adding properties to our mock
EventSource.OPEN = 1;
// @ts-ignore - Adding properties to our mock
EventSource.CLOSED = 2;

// Mock child_process's spawn
const mockStdout = {
  on: mock.fn(),
};

const mockStderr = {
  on: mock.fn(),
};

const mockStdin = {
  write: mock.fn(),
};

const mockChildProcess = {
  stdout: mockStdout,
  stderr: mockStderr,
  stdin: mockStdin,
  on: mock.fn(),
  kill: mock.fn(),
};

const mockSpawn = mock.fn(() => mockChildProcess);
// @ts-ignore - We're mocking the import
jest.mock("child_process", () => ({
  spawn: mockSpawn,
}));

// Mock uuid
const mockUuidValue = "test-uuid-value";
const mockUuidv4 = mock.fn(() => mockUuidValue);
// @ts-ignore - Override the uuid module
uuid.v4 = mockUuidv4;

// Mock fetch
const mockFetchResponse = {
  ok: true,
  status: 200,
  statusText: "OK",
  json: mock.fn(),
};
const mockFetch = mock.fn(() => Promise.resolve(mockFetchResponse));
// @ts-ignore - We're mocking the import
fetch = mockFetch;

describe("McpClientService", () => {
  let service: McpClientService;

  beforeEach(() => {
    // Reset all mocks before each test
    mockEventSourceConstructor.mock.resetCalls();
    mockEventSource.close.mock.resetCalls();
    mockSpawn.mock.resetCalls();
    mockStdout.on.mock.resetCalls();
    mockStderr.on.mock.resetCalls();
    mockStdin.write.mock.resetCalls();
    mockChildProcess.on.mock.resetCalls();
    mockChildProcess.kill.mock.resetCalls();
    mockUuidv4.mock.resetCalls();
    mockFetch.mock.resetCalls();
    if (mockFetchResponse.json.mock) {
      mockFetchResponse.json.mock.resetCalls();
    }

    // Reset EventSource event handlers
    mockEventSource.onopen = null;
    mockEventSource.onmessage = null;
    mockEventSource.onerror = null;
    
    // Create a new service instance
    service = new McpClientService();
  });

  describe("connectSse", () => {
    const testUrl = "http://test-server.com/sse";
    
    it("should create an EventSource and return a connection ID when successful", async () => {
      const connectPromise = service.connectSse(testUrl);
      
      // Trigger the onopen event to simulate successful connection
      assert.ok(mockEventSource.onopen);
      mockEventSource.onopen();
      
      const connectionId = await connectPromise;
      
      // Check EventSource was constructed with the correct URL
      assert.strictEqual(mockEventSourceConstructor.mock.callCount(), 1);
      assert.strictEqual(mockEventSourceConstructor.mock.calls[0].arguments[0], testUrl);
      
      // Check the connection ID is returned
      assert.strictEqual(connectionId, mockUuidValue);
      
      // Check the connection was stored
      assert.strictEqual((service as any).activeSseConnections.size, 1);
      assert.ok((service as any).activeSseConnections.has(mockUuidValue));
    });

    it("should handle SSE messages and pass them to the messageHandler", async () => {
      const messageHandler = mock.fn();
      const testData = { foo: "bar" };
      
      await service.connectSse(testUrl, messageHandler);
      
      // Trigger the onmessage event with test data
      const messageEvent = { data: JSON.stringify(testData) };
      mockEventSource.onmessage(messageEvent);
      
      // Verify message handler was called with parsed data
      assert.strictEqual(messageHandler.mock.callCount(), 1);
      assert.deepStrictEqual(messageHandler.mock.calls[0].arguments[0], testData);
    });

    it("should handle SSE message parse errors and pass raw data to the messageHandler", async () => {
      const messageHandler = mock.fn();
      const invalidJson = "{ not valid json";
      
      await service.connectSse(testUrl, messageHandler);
      
      // Trigger the onmessage event with invalid JSON
      const messageEvent = { data: invalidJson };
      mockEventSource.onmessage(messageEvent);
      
      // Verify message handler was called with raw data
      assert.strictEqual(messageHandler.mock.callCount(), 1);
      assert.strictEqual(messageHandler.mock.calls[0].arguments[0], invalidJson);
    });

    it("should reject the promise when an SSE error occurs before connection", async () => {
      const connectPromise = service.connectSse(testUrl);
      
      // Trigger the onerror event before onopen
      const errorEvent = { type: "error", message: "Connection failed" };
      mockEventSource.onerror(errorEvent);
      
      // Expect the promise to reject
      await assert.rejects(
        connectPromise,
        (err: Error) => {
          assert.ok(err.message.includes("Failed to establish SSE connection"));
          return true;
        }
      );
      
      // Verify no connection was stored
      assert.strictEqual((service as any).activeSseConnections.size, 0);
    });

    it("should close and remove the connection when an SSE error occurs after connection", async () => {
      // Successfully connect first
      const connectionId = await service.connectSse(testUrl);
      
      // Update readyState to simulate a connected then closed state
      mockEventSource.readyState = EventSource.CLOSED;
      
      // Trigger an error after successful connection
      const errorEvent = { type: "error", message: "Connection lost" };
      mockEventSource.onerror(errorEvent);
      
      // Verify connection was removed
      assert.strictEqual((service as any).activeSseConnections.size, 0);
      assert.strictEqual((service as any).activeSseConnections.has(connectionId), false);
    });
  });

  describe("closeSseConnection", () => {
    it("should close and remove an existing SSE connection", async () => {
      // Create a connection first
      const testUrl = "http://test-server.com/sse";
      const connectionId = await service.connectSse(testUrl);
      
      // Check initial connection state
      assert.strictEqual((service as any).activeSseConnections.size, 1);
      
      // Close the connection
      const result = service.closeSseConnection(connectionId);
      
      // Verify EventSource.close was called
      assert.strictEqual(mockEventSource.close.mock.callCount(), 1);
      
      // Verify connection was removed and function returned true
      assert.strictEqual((service as any).activeSseConnections.size, 0);
      assert.strictEqual(result, true);
    });

    it("should return false when trying to close a non-existent SSE connection", () => {
      const result = service.closeSseConnection("non-existent-id");
      
      // Verify no close was called and function returned false
      assert.strictEqual(mockEventSource.close.mock.callCount(), 0);
      assert.strictEqual(result, false);
    });
  });

  describe("connectStdio", () => {
    const testCommand = "test-command";
    const testArgs = ["arg1", "arg2"];
    
    it("should spawn a child process and return a connection ID when successful", async () => {
      const connectionId = await service.connectStdio(testCommand, testArgs);
      
      // Verify spawn was called with correct args
      assert.strictEqual(mockSpawn.mock.callCount(), 1);
      assert.strictEqual(mockSpawn.mock.calls[0].arguments[0], testCommand);
      assert.deepStrictEqual(mockSpawn.mock.calls[0].arguments[1], testArgs);
      
      // Verify event handlers were set up
      assert.strictEqual(mockStdout.on.mock.callCount(), 1);
      assert.strictEqual(mockStdout.on.mock.calls[0].arguments[0], "data");
      assert.strictEqual(mockStderr.on.mock.callCount(), 1);
      assert.strictEqual(mockStderr.on.mock.calls[0].arguments[0], "data");
      assert.strictEqual(mockChildProcess.on.mock.callCount(), 2);
      
      // Verify the connection was stored
      assert.strictEqual(connectionId, mockUuidValue);
      assert.strictEqual((service as any).activeStdioConnections.size, 1);
      assert.ok((service as any).activeStdioConnections.has(mockUuidValue));
    });

    it("should process stdout data and handle JSON lines correctly", async () => {
      const messageHandler = mock.fn();
      const connectionId = await service.connectStdio(testCommand, testArgs, messageHandler);
      
      // Get the stdout data handler
      const dataHandler = mockStdout.on.mock.calls[0].arguments[1];
      
      // Send JSON data to the handler
      const testData = { result: "success" };
      dataHandler(JSON.stringify(testData) + "\n");
      
      // Verify the message handler was called with parsed data
      assert.strictEqual(messageHandler.mock.callCount(), 1);
      assert.deepStrictEqual(messageHandler.mock.calls[0].arguments[0], testData);
    });

    it("should handle multiple JSON lines in a single data chunk", async () => {
      const messageHandler = mock.fn();
      await service.connectStdio(testCommand, testArgs, messageHandler);
      
      // Get the stdout data handler
      const dataHandler = mockStdout.on.mock.calls[0].arguments[1];
      
      // Send multiple JSON lines in a single chunk
      const line1 = { id: "1", result: "first" };
      const line2 = { id: "2", result: "second" };
      dataHandler(JSON.stringify(line1) + "\n" + JSON.stringify(line2) + "\n");
      
      // Verify both messages were processed
      assert.strictEqual(messageHandler.mock.callCount(), 2);
      assert.deepStrictEqual(messageHandler.mock.calls[0].arguments[0], line1);
      assert.deepStrictEqual(messageHandler.mock.calls[1].arguments[0], line2);
    });

    it("should handle pending requests and resolve them when matching responses are received", async () => {
      const connectionId = await service.connectStdio(testCommand);
      
      // Set up a pending request manually
      const requestId = "test-request-id";
      const pendingRequests = new Map();
      const resolvePromise = mock.fn();
      const rejectPromise = mock.fn();
      pendingRequests.set(requestId, { resolve: resolvePromise, reject: rejectPromise });
      (service as any).pendingStdioRequests.set(connectionId, pendingRequests);
      
      // Get the stdout data handler
      const dataHandler = mockStdout.on.mock.calls[0].arguments[1];
      
      // Send a response matching the request ID
      const response = { id: requestId, result: { success: true } };
      dataHandler(JSON.stringify(response) + "\n");
      
      // Verify the promise was resolved with the result
      assert.strictEqual(resolvePromise.mock.callCount(), 1);
      assert.deepStrictEqual(resolvePromise.mock.calls[0].arguments[0], { success: true });
      
      // Verify the request was removed from the pending map
      assert.strictEqual((service as any).pendingStdioRequests.has(connectionId), false);
    });

    it("should reject pending requests when a response contains an error", async () => {
      const connectionId = await service.connectStdio(testCommand);
      
      // Set up a pending request manually
      const requestId = "test-request-id";
      const pendingRequests = new Map();
      const resolvePromise = mock.fn();
      const rejectPromise = mock.fn();
      pendingRequests.set(requestId, { resolve: resolvePromise, reject: rejectPromise });
      (service as any).pendingStdioRequests.set(connectionId, pendingRequests);
      
      // Get the stdout data handler
      const dataHandler = mockStdout.on.mock.calls[0].arguments[1];
      
      // Send a response with an error
      const errorObj = { message: "Test error" };
      const response = { id: requestId, error: errorObj };
      dataHandler(JSON.stringify(response) + "\n");
      
      // Verify the promise was rejected with the error
      assert.strictEqual(rejectPromise.mock.callCount(), 1);
      assert.deepStrictEqual(rejectPromise.mock.calls[0].arguments[0], errorObj);
    });

    it("should reject pending requests when the child process emits an error", async () => {
      const connectionId = await service.connectStdio(testCommand);
      
      // Set up a pending request
      const requestId = "test-request-id";
      const pendingRequests = new Map();
      const resolvePromise = mock.fn();
      const rejectPromise = mock.fn();
      pendingRequests.set(requestId, { resolve: resolvePromise, reject: rejectPromise });
      (service as any).pendingStdioRequests.set(connectionId, pendingRequests);
      
      // Get the error handler
      const errorHandler = mockChildProcess.on.mock.calls.find(
        call => call.arguments[0] === "error"
      )?.arguments[1];
      
      assert.ok(errorHandler, "Error handler not found");
      
      // Trigger an error
      const error = new Error("Process error");
      errorHandler(error);
      
      // Verify connection was removed
      assert.strictEqual((service as any).activeStdioConnections.size, 0);
      
      // Verify pending request was rejected
      assert.strictEqual(rejectPromise.mock.callCount(), 1);
      assert.ok(rejectPromise.mock.calls[0].arguments[0] instanceof Error);
      assert.ok(rejectPromise.mock.calls[0].arguments[0].message.includes("Connection error occurred"));
    });

    it("should reject pending requests when the child process closes", async () => {
      const connectionId = await service.connectStdio(testCommand);
      
      // Set up a pending request
      const requestId = "test-request-id";
      const pendingRequests = new Map();
      const resolvePromise = mock.fn();
      const rejectPromise = mock.fn();
      pendingRequests.set(requestId, { resolve: resolvePromise, reject: rejectPromise });
      (service as any).pendingStdioRequests.set(connectionId, pendingRequests);
      
      // Get the close handler
      const closeHandler = mockChildProcess.on.mock.calls.find(
        call => call.arguments[0] === "close"
      )?.arguments[1];
      
      assert.ok(closeHandler, "Close handler not found");
      
      // Trigger a close event
      closeHandler(1, "SIGTERM");
      
      // Verify connection was removed
      assert.strictEqual((service as any).activeStdioConnections.size, 0);
      
      // Verify pending request was rejected
      assert.strictEqual(rejectPromise.mock.callCount(), 1);
      assert.ok(rejectPromise.mock.calls[0].arguments[0] instanceof Error);
      assert.ok(rejectPromise.mock.calls[0].arguments[0].message.includes("Connection closed before response"));
    });
  });

  describe("sendToStdio", () => {
    it("should write data to the child process stdin", async () => {
      // Create a connection first
      const connectionId = await service.connectStdio("test-command");
      
      // Send string data
      const stringData = "test-string-data";
      const stringResult = service.sendToStdio(connectionId, stringData);
      
      // Verify data was written
      assert.strictEqual(mockStdin.write.mock.callCount(), 1);
      assert.strictEqual(mockStdin.write.mock.calls[0].arguments[0], stringData + "\n");
      assert.strictEqual(stringResult, true);
      
      // Reset for next test
      mockStdin.write.mock.resetCalls();
      
      // Send object data
      const objectData = { test: "object-data" };
      const objectResult = service.sendToStdio(connectionId, objectData);
      
      // Verify data was JSON-stringified and written
      assert.strictEqual(mockStdin.write.mock.callCount(), 1);
      assert.strictEqual(mockStdin.write.mock.calls[0].arguments[0], JSON.stringify(objectData) + "\n");
      assert.strictEqual(objectResult, true);
    });

    it("should return false when trying to send to a non-existent connection", () => {
      const result = service.sendToStdio("non-existent-id", "test-data");
      
      // Verify no write was performed
      assert.strictEqual(mockStdin.write.mock.callCount(), 0);
      assert.strictEqual(result, false);
    });

    it("should return false if the child process has no stdin", async () => {
      // Create a connection first
      const connectionId = await service.connectStdio("test-command");
      
      // Remove stdin before attempting to send
      const childProcess = (service as any).activeStdioConnections.get(connectionId);
      delete childProcess.stdin;
      
      // Attempt to send data
      const result = service.sendToStdio(connectionId, "test-data");
      
      // Verify result is false
      assert.strictEqual(result, false);
    });
  });

  describe("closeStdioConnection", () => {
    it("should kill and remove an existing stdio connection", async () => {
      // Create a connection first
      const connectionId = await service.connectStdio("test-command");
      
      // Check initial connection state
      assert.strictEqual((service as any).activeStdioConnections.size, 1);
      
      // Close the connection
      const result = service.closeStdioConnection(connectionId);
      
      // Verify kill was called with SIGTERM
      assert.strictEqual(mockChildProcess.kill.mock.callCount(), 1);
      assert.strictEqual(mockChildProcess.kill.mock.calls[0].arguments[0], "SIGTERM");
      
      // Verify connection was removed and function returned true
      assert.strictEqual((service as any).activeStdioConnections.size, 0);
      assert.strictEqual(result, true);
    });

    it("should use the specified signal when provided", async () => {
      // Create a connection first
      const connectionId = await service.connectStdio("test-command");
      
      // Close with SIGKILL
      service.closeStdioConnection(connectionId, "SIGKILL");
      
      // Verify kill was called with SIGKILL
      assert.strictEqual(mockChildProcess.kill.mock.callCount(), 1);
      assert.strictEqual(mockChildProcess.kill.mock.calls[0].arguments[0], "SIGKILL");
    });

    it("should return false when trying to close a non-existent stdio connection", () => {
      const result = service.closeStdioConnection("non-existent-id");
      
      // Verify no kill was called and function returned false
      assert.strictEqual(mockChildProcess.kill.mock.callCount(), 0);
      assert.strictEqual(result, false);
    });
  });

  describe("getActiveSseConnectionIds and getActiveStdioConnectionIds", () => {
    it("should return an array of active SSE connection IDs", async () => {
      // Initially no connections
      let ids = service.getActiveSseConnectionIds();
      assert.deepStrictEqual(ids, []);
      
      // Create connections
      const id1 = await service.connectSse("http://server1.com/sse");
      const id2 = await service.connectSse("http://server2.com/sse");
      
      // Check IDs
      ids = service.getActiveSseConnectionIds();
      assert.strictEqual(ids.length, 2);
      assert.ok(ids.includes(id1));
      assert.ok(ids.includes(id2));
    });

    it("should return an array of active stdio connection IDs", async () => {
      // Initially no connections
      let ids = service.getActiveStdioConnectionIds();
      assert.deepStrictEqual(ids, []);
      
      // Create connections
      const id1 = await service.connectStdio("command1");
      const id2 = await service.connectStdio("command2");
      
      // Check IDs
      ids = service.getActiveStdioConnectionIds();
      assert.strictEqual(ids.length, 2);
      assert.ok(ids.includes(id1));
      assert.ok(ids.includes(id2));
    });
  });

  describe("listTools", () => {
    const testToolDefinitions = [
      { name: "tool1", description: "Test Tool 1", parametersSchema: {} },
      { name: "tool2", description: "Test Tool 2", parametersSchema: {} },
    ];

    describe("SSE connections", () => {
      let connectionId: string;
      
      beforeEach(async () => {
        // Create an SSE connection
        connectionId = await service.connectSse("http://test-server.com/sse");
        
        // Reset fetch mocks
        mockFetch.mock.resetCalls();
        mockFetchResponse.json = mock.fn(() => 
          Promise.resolve({ id: "test-response-id", result: testToolDefinitions })
        );
      });
      
      it("should fetch tools from an SSE connection", async () => {
        const tools = await service.listTools(connectionId);
        
        // Verify fetch was called with correct URL and method
        assert.strictEqual(mockFetch.mock.callCount(), 1);
        const [url, options] = mockFetch.mock.calls[0].arguments;
        assert.strictEqual(url, "http://test-server.com/sse");
        assert.strictEqual(options.method, "POST");
        
        // Verify request body
        const requestBody = JSON.parse(options.body);
        assert.strictEqual(requestBody.method, "listTools");
        assert.strictEqual(requestBody.id, mockUuidValue);
        
        // Verify response was processed
        assert.deepStrictEqual(tools, testToolDefinitions);
      });

      it("should throw an error if the MCP server returns a non-ok response", async () => {
        // Mock a failed response
        mockFetchResponse.ok = false;
        mockFetchResponse.status = 500;
        mockFetchResponse.statusText = "Internal Server Error";
        
        await assert.rejects(
          service.listTools(connectionId),
          (err: Error) => {
            assert.ok(err.message.includes("HTTP error from MCP server"));
            return true;
          }
        );
      });

      it("should throw an error if the MCP response contains an error", async () => {
        // Mock an error response
        mockFetchResponse.json = mock.fn(() => 
          Promise.resolve({ id: "test-response-id", error: { message: "Test error" } })
        );
        
        await assert.rejects(
          service.listTools(connectionId),
          (err: Error) => {
            assert.ok(err.message.includes("MCP error"));
            return true;
          }
        );
      });
    });

    describe("stdio connections", () => {
      let connectionId: string;
      
      beforeEach(async () => {
        // Create a stdio connection
        connectionId = await service.connectStdio("test-command");
      });
      
      it("should send a listTools request to a stdio connection and return the result", async () => {
        // Mock sendToStdio to capture the request
        const originalSendToStdio = service.sendToStdio;
        service.sendToStdio = mock.fn((connId, data) => {
          // Capture the original implementation result
          const result = originalSendToStdio.call(service, connId, data);
          
          // Get the data handler for the stdout event
          const dataHandler = mockStdout.on.mock.calls[0].arguments[1];
          
          // Extract request ID from the sent data
          const request = typeof data === "string" ? JSON.parse(data) : data;
          
          // Send a mock response with the same ID
          setTimeout(() => {
            dataHandler(JSON.stringify({
              id: request.id,
              result: testToolDefinitions
            }) + "\n");
          }, 0);
          
          return result;
        });
        
        // Call listTools
        const tools = await service.listTools(connectionId);
        
        // Verify sendToStdio was called
        assert.strictEqual((service.sendToStdio as any).mock.callCount(), 1);
        
        // Verify request properties
        const request = (service.sendToStdio as any).mock.calls[0].arguments[1];
        assert.strictEqual(request.method, "listTools");
        assert.strictEqual(request.id, mockUuidValue);
        
        // Verify tools were returned
        assert.deepStrictEqual(tools, testToolDefinitions);
        
        // Restore original method
        service.sendToStdio = originalSendToStdio;
      });

      it("should throw an error if sending to stdio fails", async () => {
        // Mock sendToStdio to return false
        service.sendToStdio = mock.fn(() => false);
        
        await assert.rejects(
          service.listTools(connectionId),
          (err: Error) => {
            assert.ok(err.message.includes("Failed to send request"));
            return true;
          }
        );
      });
    });

    it("should throw an error if the connection ID doesn't exist", async () => {
      await assert.rejects(
        service.listTools("non-existent-id"),
        (err: Error) => {
          assert.ok(err.message.includes("No connection found"));
          return true;
        }
      );
    });
  });

  describe("callTool", () => {
    const testToolName = "testTool";
    const testToolParams = { param1: "value1", param2: 123 };
    const testToolResult = { status: "success", data: "Tool result" };
    
    describe("SSE connections", () => {
      let connectionId: string;
      
      beforeEach(async () => {
        // Create an SSE connection
        connectionId = await service.connectSse("http://test-server.com/sse");
        
        // Reset fetch mocks
        mockFetch.mock.resetCalls();
        mockFetchResponse.json = mock.fn(() => 
          Promise.resolve({ id: "test-response-id", result: testToolResult })
        );
      });
      
      it("should call a tool on an SSE connection", async () => {
        const result = await service.callTool(connectionId, testToolName, testToolParams);
        
        // Verify fetch was called with correct URL and method
        assert.strictEqual(mockFetch.mock.callCount(), 1);
        const [url, options] = mockFetch.mock.calls[0].arguments;
        assert.strictEqual(url, "http://test-server.com/sse");
        assert.strictEqual(options.method, "POST");
        
        // Verify request body
        const requestBody = JSON.parse(options.body);
        assert.strictEqual(requestBody.method, "callTool");
        assert.strictEqual(requestBody.id, mockUuidValue);
        assert.deepStrictEqual(requestBody.params, {
          toolName: testToolName,
          arguments: testToolParams
        });
        
        // Verify response was processed
        assert.deepStrictEqual(result, testToolResult);
      });

      it("should throw an error if the MCP server returns a non-ok response", async () => {
        // Mock a failed response
        mockFetchResponse.ok = false;
        mockFetchResponse.status = 500;
        mockFetchResponse.statusText = "Internal Server Error";
        
        await assert.rejects(
          service.callTool(connectionId, testToolName, testToolParams),
          (err: Error) => {
            assert.ok(err.message.includes("HTTP error from MCP server"));
            return true;
          }
        );
      });

      it("should throw an error if the MCP response contains an error", async () => {
        // Mock an error response
        mockFetchResponse.json = mock.fn(() => 
          Promise.resolve({ id: "test-response-id", error: { message: "Tool execution failed" } })
        );
        
        await assert.rejects(
          service.callTool(connectionId, testToolName, testToolParams),
          (err: Error) => {
            assert.ok(err.message.includes("MCP error"));
            return true;
          }
        );
      });
    });
    
    describe("stdio connections", () => {
      let connectionId: string;
      
      beforeEach(async () => {
        // Create a stdio connection
        connectionId = await service.connectStdio("test-command");
      });
      
      it("should send a callTool request to a stdio connection and return the result", async () => {
        // Mock sendToStdio to capture the request
        const originalSendToStdio = service.sendToStdio;
        service.sendToStdio = mock.fn((connId, data) => {
          // Capture the original implementation result
          const result = originalSendToStdio.call(service, connId, data);
          
          // Get the data handler for the stdout event
          const dataHandler = mockStdout.on.mock.calls[0].arguments[1];
          
          // Extract request ID from the sent data
          const request = typeof data === "string" ? JSON.parse(data) : data;
          
          // Send a mock response with the same ID
          setTimeout(() => {
            dataHandler(JSON.stringify({
              id: request.id,
              result: testToolResult
            }) + "\n");
          }, 0);
          
          return result;
        });
        
        // Call the tool
        const result = await service.callTool(connectionId, testToolName, testToolParams);
        
        // Verify sendToStdio was called
        assert.strictEqual((service.sendToStdio as any).mock.callCount(), 1);
        
        // Verify request properties
        const request = (service.sendToStdio as any).mock.calls[0].arguments[1];
        assert.strictEqual(request.method, "callTool");
        assert.strictEqual(request.id, mockUuidValue);
        assert.deepStrictEqual(request.params, {
          toolName: testToolName,
          arguments: testToolParams
        });
        
        // Verify result was returned
        assert.deepStrictEqual(result, testToolResult);
        
        // Restore original method
        service.sendToStdio = originalSendToStdio;
      });

      it("should throw an error if sending to stdio fails", async () => {
        // Mock sendToStdio to return false
        service.sendToStdio = mock.fn(() => false);
        
        await assert.rejects(
          service.callTool(connectionId, testToolName, testToolParams),
          (err: Error) => {
            assert.ok(err.message.includes("Failed to send request"));
            return true;
          }
        );
      });
    });

    it("should throw an error if the connection ID doesn't exist", async () => {
      await assert.rejects(
        service.callTool("non-existent-id", testToolName, testToolParams),
        (err: Error) => {
          assert.ok(err.message.includes("No connection found"));
          return true;
        }
      );
    });
  });

  describe("closeAllConnections", () => {
    it("should close all active SSE and stdio connections", async () => {
      // Create some connections
      const sseId1 = await service.connectSse("http://server1.com/sse");
      const sseId2 = await service.connectSse("http://server2.com/sse");
      const stdioId1 = await service.connectStdio("command1");
      const stdioId2 = await service.connectStdio("command2");
      
      // Verify connections exist
      assert.strictEqual((service as any).activeSseConnections.size, 2);
      assert.strictEqual((service as any).activeStdioConnections.size, 2);
      
      // Reset mock counters before closing
      mockEventSource.close.mock.resetCalls();
      mockChildProcess.kill.mock.resetCalls();
      
      // Close all connections
      service.closeAllConnections();
      
      // Verify each connection was closed
      assert.strictEqual(mockEventSource.close.mock.callCount(), 2);
      assert.strictEqual(mockChildProcess.kill.mock.callCount(), 2);
      
      // Verify all connections were removed
      assert.strictEqual((service as any).activeSseConnections.size, 0);
      assert.strictEqual((service as any).activeStdioConnections.size, 0);
    });

    it("should do nothing if there are no active connections", () => {
      // Verify no connections exist
      assert.strictEqual((service as any).activeSseConnections.size, 0);
      assert.strictEqual((service as any).activeStdioConnections.size, 0);
      
      // Close all connections
      service.closeAllConnections();
      
      // Verify no close methods were called
      assert.strictEqual(mockEventSource.close.mock.callCount(), 0);
      assert.strictEqual(mockChildProcess.kill.mock.callCount(), 0);
    });
  });
});