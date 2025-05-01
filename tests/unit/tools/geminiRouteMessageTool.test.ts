import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { geminiRouteMessageTool } from "../../../src/tools/geminiRouteMessageTool.js";
import { GeminiApiError, ValidationError as GeminiValidationError } from "../../../src/utils/errors.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GeminiService } from "../../../src/services/index.js";
import type { GenerateContentResponse } from "@google/genai";
import { BlockedReason, FinishReason } from "@google/genai";

// Create a partial type for testing purposes
type PartialGenerateContentResponse = Partial<GenerateContentResponse>;

describe("geminiRouteMessageTool", () => {
  // Mock server and service instances
  const mockTool = mock.fn();
  const mockServer = {
    tool: mockTool,
  } as unknown as McpServer;

  // Mock routeMessage response from service with proper typing
  const mockRouteMessage = mock.fn<(params: any) => Promise<{
    response: PartialGenerateContentResponse;
    chosenModel: string;
  }>>();
  
  // Create a minimal mock service with just the necessary methods for testing
  const mockService = {
    routeMessage: mockRouteMessage,
    // Add empty implementations for required GeminiService methods
    uploadFile: () => Promise.resolve({ name: 'mock', uri: 'mock' }),
    listFiles: () => Promise.resolve({ files: [] }),
    // Add other required methods as empty implementations
  } as unknown as GeminiService;

  // Reset mocks before each test
  beforeEach(() => {
    mockTool.mock.resetCalls();
    mockRouteMessage.mock.resetCalls();
  });

  it("should register the tool with the server", () => {
    // Call the tool registration function
    geminiRouteMessageTool(mockServer, mockService);
    
    // Verify tool was registered
    assert.strictEqual(mockTool.mock.callCount(), 1);
    const [name, description, params, handler] = mockTool.mock.calls[0].arguments;
    
    // Check tool registration parameters
    assert.strictEqual(name, "gemini_routeMessage");
    assert.ok(description.includes("Routes a message"));
    assert.ok(params);
    assert.strictEqual(typeof handler, "function");
  });

  it("should call the service's routeMessage method with correct parameters", async () => {
    // Register tool to get the request handler
    geminiRouteMessageTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0].arguments;
    
    // Mock successful response with proper typing
    const mockSuccessResponse = {
      response: {
        candidates: [
          { 
            content: { 
              parts: [{ text: "This is a test response" }] 
            } 
          }
        ]
      } as PartialGenerateContentResponse,
      chosenModel: "gemini-1.5-flash"
    };
    mockRouteMessage.mock.mockImplementationOnce(() => Promise.resolve(mockSuccessResponse));
    
    // Prepare test request
    const testRequest = {
      message: "What is the capital of France?",
      models: ["gemini-1.5-pro", "gemini-1.5-flash"],
      routingPrompt: "Choose the best model",
      defaultModel: "gemini-1.5-pro"
    };
    
    // Call the handler
    const result = await handler(testRequest);
    
    // Verify service method was called
    assert.strictEqual(mockRouteMessage.mock.callCount(), 1);
    const [params] = mockRouteMessage.mock.calls[0].arguments;
    
    // Check parameters passed to service
    assert.strictEqual(params.message, testRequest.message);
    assert.deepStrictEqual(params.models, testRequest.models);
    assert.strictEqual(params.routingPrompt, testRequest.routingPrompt);
    assert.strictEqual(params.defaultModel, testRequest.defaultModel);
    
    // Verify result structure
    assert.ok(result.content);
    assert.strictEqual(result.content.length, 1);
    assert.strictEqual(result.content[0].type, "text");
    
    // Parse the JSON response
    const parsedResponse = JSON.parse(result.content[0].text);
    assert.strictEqual(parsedResponse.text, "This is a test response");
    assert.strictEqual(parsedResponse.chosenModel, "gemini-1.5-flash");
  });

  it("should handle safety blocks from the prompt", async () => {
    // Register tool to get the request handler
    geminiRouteMessageTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0].arguments;
    
    // Mock safety block response with proper typing
    const mockSafetyResponse = {
      response: {
        promptFeedback: {
          blockReason: BlockedReason.SAFETY
        }
      } as PartialGenerateContentResponse,
      chosenModel: "gemini-1.5-flash"
    };
    mockRouteMessage.mock.mockImplementationOnce(() => Promise.resolve(mockSafetyResponse));
    
    // Call the handler
    const result = await handler({
      message: "Harmful content here",
      models: ["gemini-1.5-pro", "gemini-1.5-flash"]
    });
    
    // Verify error response
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes("safety settings"));
  });

  it("should handle empty response from model", async () => {
    // Register tool to get the request handler
    geminiRouteMessageTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0].arguments;
    
    // Mock empty response with proper typing
    const mockEmptyResponse = {
      response: {
        candidates: [
          { 
            content: { parts: [] },
            finishReason: FinishReason.MAX_TOKENS
          }
        ]
      } as PartialGenerateContentResponse,
      chosenModel: "gemini-1.5-flash"
    };
    mockRouteMessage.mock.mockImplementationOnce(() => Promise.resolve(mockEmptyResponse));
    
    // Call the handler
    const result = await handler({
      message: "Test message",
      models: ["gemini-1.5-pro", "gemini-1.5-flash"]
    });
    
    // Verify empty response handling
    assert.ok(result.content);
    const parsedResponse = JSON.parse(result.content[0].text);
    assert.strictEqual(parsedResponse.text, "");
    assert.strictEqual(parsedResponse.chosenModel, "gemini-1.5-flash");
  });

  it("should map errors properly", async () => {
    // Register tool to get the request handler
    geminiRouteMessageTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0].arguments;
    
    // Mock service error
    const serviceError = new GeminiApiError("Service failed");
    mockRouteMessage.mock.mockImplementationOnce(() => Promise.reject(serviceError));
    
    // Call the handler and expect an error
    try {
      await handler({
        message: "Test message",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"]
      });
      assert.fail("Expected an error to be thrown");
    } catch (error) {
      // Verify error is properly mapped
      assert.ok(error instanceof McpError);
      assert.ok((error as McpError).message.includes("Service failed"));
    }
  });

  it("should handle validation errors", async () => {
    // Register tool to get the request handler
    geminiRouteMessageTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0].arguments;
    
    // Mock validation error
    const validationError = new GeminiValidationError("Invalid parameters");
    mockRouteMessage.mock.mockImplementationOnce(() => Promise.reject(validationError));
    
    // Call the handler and expect an error
    try {
      await handler({
        message: "Test message",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"]
      });
      assert.fail("Expected an error to be thrown");
    } catch (error) {
      // Verify error is properly mapped
      assert.ok(error instanceof McpError);
      // Code will be numeric in this context, not string "InvalidParams" 
      // This is due to how the McpError gets serialized in the test environment
      assert.ok(error.message.includes("Invalid parameters"));
    }
  });
});