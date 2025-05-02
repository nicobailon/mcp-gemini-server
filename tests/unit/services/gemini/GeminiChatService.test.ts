import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { GeminiChatService } from "../../../../src/services/gemini/GeminiChatService.js";
import {
  GeminiApiError,
  ValidationError as GeminiValidationError,
} from "../../../../src/utils/errors.js";
import { ZodError } from "zod";

// Import necessary types
import type { GenerateContentResponse } from "@google/genai";

// Create a partial type for testing purposes
type PartialGenerateContentResponse = Partial<GenerateContentResponse>;

// Mock the GoogleGenAI class with proper type signature
const mockGenerateContent =
  mock.fn<(config: any) => Promise<PartialGenerateContentResponse>>();
const mockGoogleGenAI = {
  models: {
    generateContent: mockGenerateContent,
  },
};

// Mock uuid for predictable testing
const mockUuid = "test-session-id";
// Mock uuid function
const originalUuid = await import("uuid");
const uuidMock = mock.fn(() => mockUuid);
originalUuid.v4 = uuidMock;

describe("GeminiChatService", () => {
  let chatService: GeminiChatService;
  const defaultModel = "gemini-1.5-pro";

  beforeEach(() => {
    // Reset mocks before each test
    mockGenerateContent.mock.resetCalls();

    // Initialize chat service with mocked dependencies
    chatService = new GeminiChatService(mockGoogleGenAI as any, defaultModel);
  });

  describe("startChatSession", () => {
    it("should create a new chat session with default model when no model is provided", () => {
      const sessionId = chatService.startChatSession({});

      assert.strictEqual(sessionId, mockUuid);

      // Get the session from private map using any assertion
      const sessions = (chatService as any).chatSessions;
      const session = sessions.get(mockUuid);

      assert.strictEqual(session.model, defaultModel);
      assert.deepStrictEqual(session.history, []);
      assert.ok(session.config);
    });

    it("should create a new chat session with provided model", () => {
      const customModel = "gemini-1.5-flash";
      const sessionId = chatService.startChatSession({
        modelName: customModel,
      });

      assert.strictEqual(sessionId, mockUuid);

      // Get the session from private map using any assertion
      const sessions = (chatService as any).chatSessions;
      const session = sessions.get(mockUuid);

      assert.strictEqual(session.model, customModel);
    });

    it("should include history if provided", () => {
      const history = [
        { role: "user", parts: [{ text: "Hello" }] },
        { role: "model", parts: [{ text: "Hi there" }] },
      ];

      const sessionId = chatService.startChatSession({ history });

      // Get the session from private map using any assertion
      const sessions = (chatService as any).chatSessions;
      const session = sessions.get(mockUuid);

      assert.deepStrictEqual(session.history, history);
      assert.deepStrictEqual(session.config.history, history);
    });

    it("should convert string systemInstruction to Content object", () => {
      const systemInstruction = "You are a helpful assistant";

      const sessionId = chatService.startChatSession({ systemInstruction });

      // Get the session from private map using any assertion
      const sessions = (chatService as any).chatSessions;
      const session = sessions.get(mockUuid);

      assert.deepStrictEqual(session.config.systemInstruction, {
        parts: [{ text: systemInstruction }],
      });
    });

    it("should throw when no model name is available", () => {
      // Create a service with no default model
      const noDefaultService = new GeminiChatService(mockGoogleGenAI as any);

      assert.throws(
        () => noDefaultService.startChatSession({}),
        (err: Error) => {
          assert(err instanceof GeminiApiError);
          assert(err.message.includes("Model name must be provided"));
          return true;
        }
      );
    });
  });

  describe("sendMessageToSession", () => {
    beforeEach(() => {
      // Create a test session first
      chatService.startChatSession({});
    });

    it("should send a message to an existing session", async () => {
      // Mock successful response with proper typing
      const mockResponse: PartialGenerateContentResponse = {
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: "Hello, how can I help you?" }],
            },
          },
        ],
        text: "Hello, how can I help you?",
      };
      mockGenerateContent.mock.mockImplementationOnce(() =>
        Promise.resolve(mockResponse)
      );

      const response = await chatService.sendMessageToSession({
        sessionId: mockUuid,
        message: "Hi there",
      });

      // Verify generateContent was called with correct params
      assert.strictEqual(mockGenerateContent.mock.calls.length, 1);
      const [requestConfig] = mockGenerateContent.mock.calls[0].arguments;
      assert.strictEqual(requestConfig.model, defaultModel);
      assert.ok(requestConfig.contents);

      // Verify last message in contents is user message
      const lastContent =
        requestConfig.contents[requestConfig.contents.length - 1];
      assert.strictEqual(lastContent.role, "user");
      assert.strictEqual(lastContent.parts[0].text, "Hi there");

      // Verify response
      assert.deepStrictEqual(response, mockResponse);

      // Check that history was updated in the session
      const sessions = (chatService as any).chatSessions;
      const session = sessions.get(mockUuid);
      assert.strictEqual(session.history.length, 2); // User + model response
    });

    it("should throw when session doesn't exist", async () => {
      await assert.rejects(
        chatService.sendMessageToSession({
          sessionId: "non-existent-session",
          message: "Hi there",
        }),
        (err: Error) => {
          assert(err instanceof GeminiApiError);
          assert(err.message.includes("Chat session not found"));
          return true;
        }
      );
    });

    it("should apply per-message configuration options", async () => {
      // Mock successful response with proper typing
      const emptyResponse: PartialGenerateContentResponse = {};
      mockGenerateContent.mock.mockImplementationOnce(() =>
        Promise.resolve(emptyResponse)
      );

      const generationConfig = { temperature: 0.7 };
      const safetySettings = [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
      ];

      await chatService.sendMessageToSession({
        sessionId: mockUuid,
        message: "Hi there",
        generationConfig,
        safetySettings: safetySettings as any,
      });

      // Verify configuration was applied
      const [requestConfig] = mockGenerateContent.mock.calls[0].arguments;
      assert.deepStrictEqual(requestConfig.generationConfig, generationConfig);
      assert.deepStrictEqual(requestConfig.safetySettings, safetySettings);
    });
  });

  describe("sendFunctionResultToSession", () => {
    beforeEach(() => {
      // Create a test session first
      chatService.startChatSession({});
    });

    it("should send a function result to an existing session", async () => {
      // Mock successful response with proper typing
      const mockResponse: PartialGenerateContentResponse = {
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: "I've processed that function result" }],
            },
          },
        ],
      };
      mockGenerateContent.mock.mockImplementationOnce(() =>
        Promise.resolve(mockResponse)
      );

      const response = await chatService.sendFunctionResultToSession({
        sessionId: mockUuid,
        functionResponse: '{"result": "success"}',
        functionCall: { name: "testFunction" },
      });

      // Verify generateContent was called with correct params
      assert.strictEqual(mockGenerateContent.mock.calls.length, 1);
      const [requestConfig] = mockGenerateContent.mock.calls[0].arguments;

      // Verify content contains function response
      const functionResponseContent = requestConfig.contents.find(
        (c: any) => c.role === "function"
      );
      assert.ok(functionResponseContent);
      assert.strictEqual(
        functionResponseContent.parts[0].functionResponse.name,
        "testFunction"
      );

      // Verify response
      assert.deepStrictEqual(response, mockResponse);

      // Check that history was updated in the session
      const sessions = (chatService as any).chatSessions;
      const session = sessions.get(mockUuid);
      assert.strictEqual(session.history.length, 2); // Function call + model response
    });

    it("should throw when session doesn't exist", async () => {
      await assert.rejects(
        chatService.sendFunctionResultToSession({
          sessionId: "non-existent-session",
          functionResponse: "{}",
        }),
        (err: Error) => {
          assert(err instanceof GeminiApiError);
          assert(err.message.includes("Chat session not found"));
          return true;
        }
      );
    });
  });

  describe("routeMessage", () => {
    it("should validate input parameters", async () => {
      // Invalid parameters to trigger validation error
      await assert.rejects(
        chatService.routeMessage({
          message: "", // Empty message
          models: [], // Empty models array
        } as any),
        (err: Error) => {
          assert(err instanceof GeminiValidationError);
          return true;
        }
      );
    });

    it("should use the first model to do routing and selected model for the message", async () => {
      // Mock successful routing response
      const routingResponse: PartialGenerateContentResponse = {
        text: "gemini-1.5-flash",
      };
      mockGenerateContent.mock.mockImplementationOnce(() =>
        Promise.resolve(routingResponse)
      );

      // Mock successful content response
      const contentResponse: PartialGenerateContentResponse = {
        text: "Response from flash model",
        candidates: [
          {
            content: {
              parts: [{ text: "Response from flash model" }],
            },
          },
        ],
      };
      mockGenerateContent.mock.mockImplementationOnce(() =>
        Promise.resolve(contentResponse)
      );

      const result = await chatService.routeMessage({
        message: "What is the capital of France?",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"],
      });

      // Verify routing was done with the first model
      assert.strictEqual(mockGenerateContent.mock.calls.length, 2);
      const [routingConfig] = mockGenerateContent.mock.calls[0].arguments;
      assert.strictEqual(routingConfig.model, "gemini-1.5-pro");
      assert.ok(routingConfig.contents[0].parts[0].text.includes("router"));

      // Verify final request used the chosen model
      const [messageConfig] = mockGenerateContent.mock.calls[1].arguments;
      assert.strictEqual(messageConfig.model, "gemini-1.5-flash");

      // Verify result contains both response and chosen model
      assert.ok(result.response);
      assert.strictEqual(result.chosenModel, "gemini-1.5-flash");
    });

    it("should use default model if routing fails to identify a model", async () => {
      // Mock routing response that doesn't match any model
      const unknownModelResponse: PartialGenerateContentResponse = {
        text: "unknown-model",
      };
      mockGenerateContent.mock.mockImplementationOnce(() =>
        Promise.resolve(unknownModelResponse)
      );

      // Mock successful content response
      const defaultModelResponse: PartialGenerateContentResponse = {
        text: "Response from default model",
        candidates: [
          {
            content: {
              parts: [{ text: "Response from default model" }],
            },
          },
        ],
      };
      mockGenerateContent.mock.mockImplementationOnce(() =>
        Promise.resolve(defaultModelResponse)
      );

      const result = await chatService.routeMessage({
        message: "What is the capital of France?",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"],
        defaultModel: "gemini-1.5-pro",
      });

      // Verify final request used the default model
      const [messageConfig] = mockGenerateContent.mock.calls[1].arguments;
      assert.strictEqual(messageConfig.model, "gemini-1.5-pro");
      assert.strictEqual(result.chosenModel, "gemini-1.5-pro");
    });

    it("should throw if routing fails and no default model is provided", async () => {
      // Mock routing response that doesn't match any model
      const failedRoutingResponse: PartialGenerateContentResponse = {
        text: "unknown-model",
      };
      mockGenerateContent.mock.mockImplementationOnce(() =>
        Promise.resolve(failedRoutingResponse)
      );

      await assert.rejects(
        chatService.routeMessage({
          message: "What is the capital of France?",
          models: ["gemini-1.5-pro", "gemini-1.5-flash"],
        }),
        (err: Error) => {
          assert(err instanceof GeminiApiError);
          assert(err.message.includes("Routing failed"));
          return true;
        }
      );
    });

    it("should use custom routing prompt if provided", async () => {
      // Mock successful routing and content responses
      const customPromptRoutingResponse: PartialGenerateContentResponse = {
        text: "gemini-1.5-flash",
      };
      mockGenerateContent.mock.mockImplementationOnce(() =>
        Promise.resolve(customPromptRoutingResponse)
      );

      const customPromptContentResponse: PartialGenerateContentResponse = {
        text: "Response",
      };
      mockGenerateContent.mock.mockImplementationOnce(() =>
        Promise.resolve(customPromptContentResponse)
      );

      const customPrompt = "Choose the most performant model for this request";

      await chatService.routeMessage({
        message: "What is the capital of France?",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"],
        routingPrompt: customPrompt,
      });

      // Verify routing was done with the custom prompt
      const [routingConfig] = mockGenerateContent.mock.calls[0].arguments;
      const promptText = routingConfig.contents[0].parts[0].text;
      assert.ok(promptText.includes(customPrompt));
    });

    it("should pass system instruction to both routing and content requests", async () => {
      // Mock successful routing and content responses
      const customPromptRoutingResponse: PartialGenerateContentResponse = {
        text: "gemini-1.5-flash",
      };
      mockGenerateContent.mock.mockImplementationOnce(() =>
        Promise.resolve(customPromptRoutingResponse)
      );

      const customPromptContentResponse: PartialGenerateContentResponse = {
        text: "Response",
      };
      mockGenerateContent.mock.mockImplementationOnce(() =>
        Promise.resolve(customPromptContentResponse)
      );

      const systemInstruction = "You are a helpful assistant";

      await chatService.routeMessage({
        message: "What is the capital of France?",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"],
        systemInstruction,
      });

      // Verify system instruction was added to routing request
      const [routingConfig] = mockGenerateContent.mock.calls[0].arguments;
      assert.strictEqual(routingConfig.contents[0].role, "system");
      assert.strictEqual(
        routingConfig.contents[0].parts[0].text,
        systemInstruction
      );

      // Verify system instruction was added to content request
      const [messageConfig] = mockGenerateContent.mock.calls[1].arguments;
      assert.strictEqual(messageConfig.contents[0].role, "system");
      assert.strictEqual(
        messageConfig.contents[0].parts[0].text,
        systemInstruction
      );
    });
  });
});
