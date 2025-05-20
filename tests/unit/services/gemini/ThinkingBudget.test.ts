import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";
import { GeminiContentService } from "../../../../src/services/gemini/GeminiContentService.js";
import { GeminiSecurityService } from "../../../../src/services/gemini/GeminiSecurityService.js";
import { GeminiChatService } from "../../../../src/services/gemini/GeminiChatService.js";
import { GenerateContentResponse } from "@google/genai";
import { FinishReason } from "../../../../src/types/googleGenAITypes.js";

// Create a partial type for mocking GenerateContentResponse
type PartialGenerateContentResponse = Partial<GenerateContentResponse>;

// Define extended generation config type for tests
interface ExtendedGenerationConfig {
  temperature?: number;
  thinkingConfig?: {
    thinkingBudget?: number;
    reasoningEffort?: "none" | "low" | "medium" | "high";
  };
}

describe("Thinking Budget Feature", () => {
  // Create a properly typed mock requestConfig for assertions
  interface MockRequestConfig {
    thinkingConfig?: {
      thinkingBudget?: number;
    };
  }

  // Mock GoogleGenAI
  const mockGenerateContentMethod = mock.fn((_config?: MockRequestConfig) => ({
    text: "Mock response from generateContent",
  }));

  const mockGenAI = {
    models: {
      generateContent: mockGenerateContentMethod,
      generateContentStream: mock.fn(async function* () {
        yield { text: "Mock response from generateContentStream" };
      }),
    },
  };

  // Reset mocks before each test
  beforeEach(() => {
    mockGenerateContentMethod.mock.resetCalls();
  });

  describe("GeminiContentService", () => {
    it("should apply thinking budget from generationConfig", async () => {
      // Arrange
      const service = new GeminiContentService(
        mockGenAI as any,
        "gemini-1.5-pro",
        new GeminiSecurityService()
      );

      // Act
      await service.generateContent({
        prompt: "Test prompt",
        generationConfig: {
          temperature: 0.7,
          thinkingConfig: {
            thinkingBudget: 5000,
          },
        } as ExtendedGenerationConfig,
      });

      // Assert
      assert.strictEqual(mockGenerateContentMethod.mock.calls.length, 1);
      // Get mock arguments safely with null checks
      const args = mockGenerateContentMethod.mock.calls[0];
      assert.ok(args, "Mock should have been called with arguments");

      const requestConfig = args.arguments[0];
      assert.ok(requestConfig, "Request config should exist");
      assert.ok(requestConfig.thinkingConfig, "Should have thinkingConfig");
      assert.strictEqual(
        requestConfig.thinkingConfig.thinkingBudget,
        5000,
        "Should pass the thinking budget"
      );
    });

    it("should map reasoningEffort to thinkingBudget values", async () => {
      // Arrange
      const service = new GeminiContentService(
        mockGenAI as any,
        "gemini-1.5-pro",
        new GeminiSecurityService()
      );

      // Test different reasoning effort values
      const testCases = [
        { reasoningEffort: "none", expectedBudget: 0 },
        { reasoningEffort: "low", expectedBudget: 1024 },
        { reasoningEffort: "medium", expectedBudget: 8192 },
        { reasoningEffort: "high", expectedBudget: 24576 },
      ];

      for (const testCase of testCases) {
        mockGenerateContentMethod.mock.resetCalls();

        // Act
        await service.generateContent({
          prompt: "Test prompt",
          generationConfig: {
            thinkingConfig: {
              reasoningEffort: testCase.reasoningEffort as any,
            },
          } as ExtendedGenerationConfig,
        });

        // Assert
        assert.strictEqual(mockGenerateContentMethod.mock.calls.length, 1);
        // Get mock arguments safely with null checks
        const args = mockGenerateContentMethod.mock.calls[0];
        assert.ok(args, "Mock should have been called with arguments");

        const requestConfig = args.arguments[0];
        assert.ok(requestConfig, "Request config should exist");
        assert.ok(requestConfig.thinkingConfig, "Should have thinkingConfig");
        assert.strictEqual(
          requestConfig.thinkingConfig.thinkingBudget,
          testCase.expectedBudget,
          `Should map reasoningEffort '${testCase.reasoningEffort}' to thinkingBudget ${testCase.expectedBudget}`
        );
      }
    });

    it("should apply default thinking budget when provided", async () => {
      // Arrange
      const defaultThinkingBudget = 3000;
      const service = new GeminiContentService(
        mockGenAI as any,
        "gemini-1.5-pro",
        new GeminiSecurityService(),
        defaultThinkingBudget
      );

      // Act
      await service.generateContent({
        prompt: "Test prompt",
      });

      // Assert
      assert.strictEqual(mockGenerateContentMethod.mock.calls.length, 1);
      // Get mock arguments safely with null checks
      const args = mockGenerateContentMethod.mock.calls[0];
      assert.ok(args, "Mock should have been called with arguments");

      const requestConfig = args.arguments[0];
      assert.ok(requestConfig, "Request config should exist");
      assert.ok(requestConfig.thinkingConfig, "Should have thinkingConfig");
      assert.strictEqual(
        requestConfig.thinkingConfig.thinkingBudget,
        defaultThinkingBudget,
        "Should apply default thinking budget"
      );
    });

    it("should prioritize generationConfig thinking budget over default", async () => {
      // Arrange
      const defaultThinkingBudget = 3000;
      const configThinkingBudget = 8000;
      const service = new GeminiContentService(
        mockGenAI as any,
        "gemini-1.5-pro",
        new GeminiSecurityService(),
        defaultThinkingBudget
      );

      // Act
      await service.generateContent({
        prompt: "Test prompt",
        generationConfig: {
          thinkingConfig: {
            thinkingBudget: configThinkingBudget,
          },
        } as ExtendedGenerationConfig,
      });

      // Assert
      assert.strictEqual(mockGenerateContentMethod.mock.calls.length, 1);
      // Get mock arguments safely with null checks
      const args = mockGenerateContentMethod.mock.calls[0];
      assert.ok(args, "Mock should have been called with arguments");

      const requestConfig = args.arguments[0];
      assert.ok(requestConfig, "Request config should exist");
      assert.ok(requestConfig.thinkingConfig, "Should have thinkingConfig");
      assert.strictEqual(
        requestConfig.thinkingConfig.thinkingBudget,
        configThinkingBudget,
        "Should prioritize generationConfig thinking budget"
      );
    });
  });

  describe("GeminiChatService", () => {
    // Mock for chat service with proper typing
    const mockChatGenerateContentMethod = mock.fn(
      (
        _config?: MockRequestConfig
      ): Promise<PartialGenerateContentResponse> => {
        const response: PartialGenerateContentResponse = {
          candidates: [
            {
              content: {
                role: "model",
                parts: [{ text: "Mock chat response" }],
              },
              finishReason: FinishReason.STOP,
            },
          ],
          promptFeedback: {},
        };

        // Define the text property as a getter function
        Object.defineProperty(response, "text", {
          get: function () {
            return "Mock chat response";
          },
        });

        return Promise.resolve(response);
      }
    );

    const mockChatGenAI = {
      models: {
        generateContent: mockChatGenerateContentMethod,
      },
    };

    beforeEach(() => {
      mockChatGenerateContentMethod.mock.resetCalls();
    });

    it("should apply thinking budget to chat session", async () => {
      // Arrange
      const chatService = new GeminiChatService(
        mockChatGenAI as any,
        "gemini-1.5-pro"
      );

      // Act
      const sessionId = chatService.startChatSession({
        generationConfig: {
          temperature: 0.7,
          thinkingConfig: {
            thinkingBudget: 6000,
          },
        } as ExtendedGenerationConfig,
      });

      await chatService.sendMessageToSession({
        sessionId,
        message: "Hello",
      });

      // Assert
      assert.strictEqual(mockChatGenerateContentMethod.mock.calls.length, 1);
      // Get mock arguments safely with null checks
      const args = mockChatGenerateContentMethod.mock.calls[0];
      assert.ok(args, "Mock should have been called with arguments");

      const requestConfig = args.arguments[0];
      assert.ok(requestConfig, "Request config should exist");
      assert.ok(requestConfig.thinkingConfig, "Should have thinkingConfig");
      assert.strictEqual(
        requestConfig.thinkingConfig.thinkingBudget,
        6000,
        "Should pass the thinking budget from chat session"
      );
    });

    it("should map reasoningEffort to thinkingBudget in chat session", async () => {
      // Arrange
      const chatService = new GeminiChatService(
        mockChatGenAI as any,
        "gemini-1.5-pro"
      );

      // Test different reasoning effort values
      const testCases = [
        { reasoningEffort: "none", expectedBudget: 0 },
        { reasoningEffort: "low", expectedBudget: 1024 },
        { reasoningEffort: "medium", expectedBudget: 8192 },
        { reasoningEffort: "high", expectedBudget: 24576 },
      ];

      for (const testCase of testCases) {
        mockChatGenerateContentMethod.mock.resetCalls();

        // Act
        const sessionId = chatService.startChatSession({
          generationConfig: {
            thinkingConfig: {
              reasoningEffort: testCase.reasoningEffort as any,
            },
          } as ExtendedGenerationConfig,
        });

        await chatService.sendMessageToSession({
          sessionId,
          message: "Hello",
        });

        // Assert
        assert.strictEqual(mockChatGenerateContentMethod.mock.calls.length, 1);
        // Get mock arguments safely with null checks
        const args = mockChatGenerateContentMethod.mock.calls[0];
        assert.ok(args, "Mock should have been called with arguments");

        const requestConfig = args.arguments[0];
        assert.ok(requestConfig, "Request config should exist");
        assert.ok(requestConfig.thinkingConfig, "Should have thinkingConfig");
        assert.strictEqual(
          requestConfig.thinkingConfig.thinkingBudget,
          testCase.expectedBudget,
          `Should map reasoningEffort '${testCase.reasoningEffort}' to thinkingBudget ${testCase.expectedBudget}`
        );
      }
    });

    it("should override session thinking budget with message thinking budget", async () => {
      // Arrange
      const chatService = new GeminiChatService(
        mockChatGenAI as any,
        "gemini-1.5-pro"
      );

      // Act
      const sessionId = chatService.startChatSession({
        generationConfig: {
          thinkingConfig: {
            thinkingBudget: 3000,
          },
        } as ExtendedGenerationConfig,
      });

      await chatService.sendMessageToSession({
        sessionId,
        message: "Hello",
        generationConfig: {
          thinkingConfig: {
            thinkingBudget: 8000,
          },
        } as ExtendedGenerationConfig,
      });

      // Assert
      assert.strictEqual(mockChatGenerateContentMethod.mock.calls.length, 1);
      // Get mock arguments safely with null checks
      const args = mockChatGenerateContentMethod.mock.calls[0];
      assert.ok(args, "Mock should have been called with arguments");

      const requestConfig = args.arguments[0];
      assert.ok(requestConfig, "Request config should exist");
      assert.ok(requestConfig.thinkingConfig, "Should have thinkingConfig");
      assert.strictEqual(
        requestConfig.thinkingConfig.thinkingBudget,
        8000,
        "Should override session thinking budget with message thinking budget"
      );
    });
  });
});
