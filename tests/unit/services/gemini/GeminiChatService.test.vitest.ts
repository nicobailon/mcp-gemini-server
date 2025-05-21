import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
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

// Mock uuid
vi.mock("uuid", () => ({
  v4: () => "test-session-id",
}));

describe("GeminiChatService", () => {
  let chatService: GeminiChatService;
  const defaultModel = "gemini-1.5-pro";

  // Mock the GoogleGenAI class
  const mockGenerateContent = vi.fn<
    any,
    Promise<PartialGenerateContentResponse>
  >();
  const mockGoogleGenAI = {
    models: {
      generateContent: mockGenerateContent,
    },
  };

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Initialize chat service with mocked dependencies
    chatService = new GeminiChatService(mockGoogleGenAI as any, defaultModel);
  });

  describe("startChatSession", () => {
    it("should create a new chat session with default model when no model is provided", () => {
      const sessionId = chatService.startChatSession({});

      expect(sessionId).toBe("test-session-id");

      // Get the session from private map using any assertion
      const sessions = (chatService as any).chatSessions;
      const session = sessions.get("test-session-id");

      expect(session.model).toBe(defaultModel);
      expect(session.history).toEqual([]);
      expect(session.config).toBeDefined();
    });

    it("should create a new chat session with provided model", () => {
      const customModel = "gemini-1.5-flash";
      const sessionId = chatService.startChatSession({
        modelName: customModel,
      });

      expect(sessionId).toBe("test-session-id");

      // Get the session from private map using any assertion
      const sessions = (chatService as any).chatSessions;
      const session = sessions.get("test-session-id");

      expect(session.model).toBe(customModel);
    });

    it("should include history if provided", () => {
      const history = [
        { role: "user", parts: [{ text: "Hello" }] },
        { role: "model", parts: [{ text: "Hi there" }] },
      ];

      const sessionId = chatService.startChatSession({ history });

      // Get the session from private map using any assertion
      const sessions = (chatService as any).chatSessions;
      const session = sessions.get("test-session-id");

      expect(session.history).toEqual(history);
      expect(session.config.history).toEqual(history);
    });

    it("should convert string systemInstruction to Content object", () => {
      const systemInstruction = "You are a helpful assistant";

      const sessionId = chatService.startChatSession({ systemInstruction });

      // Get the session from private map using any assertion
      const sessions = (chatService as any).chatSessions;
      const session = sessions.get("test-session-id");

      expect(session.config.systemInstruction).toEqual({
        parts: [{ text: systemInstruction }],
      });
    });

    it("should throw when no model name is available", () => {
      // Create a service with no default model
      const noDefaultService = new GeminiChatService(mockGoogleGenAI as any);

      expect(() => noDefaultService.startChatSession({})).toThrow(
        GeminiApiError
      );
      expect(() => noDefaultService.startChatSession({})).toThrow(
        "Model name must be provided"
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
      mockGenerateContent.mockResolvedValueOnce(mockResponse);

      const response = await chatService.sendMessageToSession({
        sessionId: "test-session-id",
        message: "Hi there",
      });

      // Verify generateContent was called with correct params
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const requestConfig = mockGenerateContent.mock.calls[0][0];
      expect(requestConfig.model).toBe(defaultModel);
      expect(requestConfig.contents).toBeDefined();

      // Just verify the message exists somewhere in the contents
      const userContent = requestConfig.contents.find(
        (content: any) =>
          content.role === "user" && content.parts[0].text === "Hi there"
      );
      expect(userContent).toBeDefined();

      // Verify response
      expect(response).toEqual(mockResponse);

      // Check that history was updated in the session
      const sessions = (chatService as any).chatSessions;
      const session = sessions.get("test-session-id");
      expect(session.history.length).toBe(2); // User + model response
    });

    it("should throw when session doesn't exist", async () => {
      await expect(
        chatService.sendMessageToSession({
          sessionId: "non-existent-session",
          message: "Hi there",
        })
      ).rejects.toThrow(GeminiApiError);

      await expect(
        chatService.sendMessageToSession({
          sessionId: "non-existent-session",
          message: "Hi there",
        })
      ).rejects.toThrow("Chat session not found");
    });

    it("should apply per-message configuration options", async () => {
      // Mock successful response with proper typing
      const emptyResponse: PartialGenerateContentResponse = {};
      mockGenerateContent.mockResolvedValueOnce(emptyResponse);

      const generationConfig = { temperature: 0.7 };
      const safetySettings = [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
      ];

      await chatService.sendMessageToSession({
        sessionId: "test-session-id",
        message: "Hi there",
        generationConfig,
        safetySettings: safetySettings as any,
      });

      // Verify configuration was applied
      const requestConfig = mockGenerateContent.mock.calls[0][0];
      expect(requestConfig.generationConfig).toEqual(generationConfig);
      expect(requestConfig.safetySettings).toEqual(safetySettings);
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
      mockGenerateContent.mockResolvedValueOnce(mockResponse);

      const response = await chatService.sendFunctionResultToSession({
        sessionId: "test-session-id",
        functionResponse: '{"result": "success"}',
        functionCall: { name: "testFunction" },
      });

      // Verify generateContent was called with correct params
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const requestConfig = mockGenerateContent.mock.calls[0][0];

      // Verify content contains function response
      const functionResponseContent = requestConfig.contents.find(
        (c: any) => c.role === "function"
      );
      expect(functionResponseContent).toBeDefined();
      expect(functionResponseContent.parts[0].functionResponse.name).toBe(
        "testFunction"
      );

      // Verify response
      expect(response).toEqual(mockResponse);

      // Check that history was updated in the session
      const sessions = (chatService as any).chatSessions;
      const session = sessions.get("test-session-id");
      expect(session.history.length).toBe(2); // Function call + model response
    });

    it("should throw when session doesn't exist", async () => {
      await expect(
        chatService.sendFunctionResultToSession({
          sessionId: "non-existent-session",
          functionResponse: "{}",
        })
      ).rejects.toThrow(GeminiApiError);

      await expect(
        chatService.sendFunctionResultToSession({
          sessionId: "non-existent-session",
          functionResponse: "{}",
        })
      ).rejects.toThrow("Chat session not found");
    });
  });

  describe("routeMessage", () => {
    it("should validate input parameters", async () => {
      // Invalid parameters to trigger validation error
      await expect(
        chatService.routeMessage({
          message: "", // Empty message
          models: [], // Empty models array
        } as any)
      ).rejects.toThrow(GeminiValidationError);
    });

    it("should use the first model to do routing and selected model for the message", async () => {
      // Mock successful routing response
      const routingResponse: PartialGenerateContentResponse = {
        text: "gemini-1.5-flash",
      };
      mockGenerateContent.mockResolvedValueOnce(routingResponse);

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
      mockGenerateContent.mockResolvedValueOnce(contentResponse);

      const result = await chatService.routeMessage({
        message: "What is the capital of France?",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"],
      });

      // Verify routing was done with the first model
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      const routingConfig = mockGenerateContent.mock.calls[0][0];
      expect(routingConfig.model).toBe("gemini-1.5-pro");
      expect(routingConfig.contents[0].parts[0].text).toContain("router");

      // Verify final request used the chosen model
      const messageConfig = mockGenerateContent.mock.calls[1][0];
      expect(messageConfig.model).toBe("gemini-1.5-flash");

      // Verify result contains both response and chosen model
      expect(result.response).toBeDefined();
      expect(result.chosenModel).toBe("gemini-1.5-flash");
    });

    it("should use default model if routing fails to identify a model", async () => {
      // Mock routing response that doesn't match any model
      const unknownModelResponse: PartialGenerateContentResponse = {
        text: "unknown-model",
      };
      mockGenerateContent.mockResolvedValueOnce(unknownModelResponse);

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
      mockGenerateContent.mockResolvedValueOnce(defaultModelResponse);

      const result = await chatService.routeMessage({
        message: "What is the capital of France?",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"],
        defaultModel: "gemini-1.5-pro",
      });

      // Verify final request used the default model
      const messageConfig = mockGenerateContent.mock.calls[1][0];
      expect(messageConfig.model).toBe("gemini-1.5-pro");
      expect(result.chosenModel).toBe("gemini-1.5-pro");
    });

    it("should throw if routing fails and no default model is provided", async () => {
      // Mock routing response that doesn't match any model
      const failedRoutingResponse: PartialGenerateContentResponse = {
        text: "unknown-model",
      };
      mockGenerateContent.mockResolvedValueOnce(failedRoutingResponse);

      await expect(
        chatService.routeMessage({
          message: "What is the capital of France?",
          models: ["gemini-1.5-pro", "gemini-1.5-flash"],
        })
      ).rejects.toThrow(GeminiApiError);

      await expect(
        chatService.routeMessage({
          message: "What is the capital of France?",
          models: ["gemini-1.5-pro", "gemini-1.5-flash"],
        })
      ).rejects.toThrow(/Routing failed|Failed to route message/);
    });

    it("should use custom routing prompt if provided", async () => {
      // Mock successful routing and content responses
      const customPromptRoutingResponse: PartialGenerateContentResponse = {
        text: "gemini-1.5-flash",
      };
      mockGenerateContent.mockResolvedValueOnce(customPromptRoutingResponse);

      const customPromptContentResponse: PartialGenerateContentResponse = {
        text: "Response",
      };
      mockGenerateContent.mockResolvedValueOnce(customPromptContentResponse);

      const customPrompt = "Choose the most performant model for this request";

      await chatService.routeMessage({
        message: "What is the capital of France?",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"],
        routingPrompt: customPrompt,
      });

      // Verify routing was done with the custom prompt
      const routingConfig = mockGenerateContent.mock.calls[0][0];
      const promptText = routingConfig.contents[0].parts[0].text;
      expect(promptText).toContain(customPrompt);
    });

    it("should pass system instruction to both routing and content requests", async () => {
      // Mock successful routing and content responses
      const customPromptRoutingResponse: PartialGenerateContentResponse = {
        text: "gemini-1.5-flash",
      };
      mockGenerateContent.mockResolvedValueOnce(customPromptRoutingResponse);

      const customPromptContentResponse: PartialGenerateContentResponse = {
        text: "Response",
      };
      mockGenerateContent.mockResolvedValueOnce(customPromptContentResponse);

      const systemInstruction = "You are a helpful assistant";

      await chatService.routeMessage({
        message: "What is the capital of France?",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"],
        systemInstruction,
      });

      // Verify system instruction was added to routing request
      const routingConfig = mockGenerateContent.mock.calls[0][0];
      expect(routingConfig.contents[0].role).toBe("system");
      expect(routingConfig.contents[0].parts[0].text).toBe(systemInstruction);

      // Verify system instruction was added to content request
      const messageConfig = mockGenerateContent.mock.calls[1][0];
      expect(messageConfig.contents[0].role).toBe("system");
      expect(messageConfig.contents[0].parts[0].text).toBe(systemInstruction);
    });
  });
});
