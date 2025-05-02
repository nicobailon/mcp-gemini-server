import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";
import { GeminiContentService } from "../../../../src/services/gemini/GeminiContentService.js";
import { GeminiSecurityService } from "../../../../src/services/gemini/GeminiSecurityService.js";
import { GeminiChatService } from "../../../../src/services/gemini/GeminiChatService.js";
import { GenerateContentResponse } from "@google/genai";

describe("Thinking Budget Feature", () => {
  // Mock GoogleGenAI
  const mockGenerateContentMethod = mock.fn(() => ({
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
        },
      });

      // Assert
      assert.strictEqual(mockGenerateContentMethod.mock.calls.length, 1);
      const requestConfig =
        mockGenerateContentMethod.mock.calls[0].arguments[0];
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
          },
        });

        // Assert
        assert.strictEqual(mockGenerateContentMethod.mock.calls.length, 1);
        const requestConfig =
          mockGenerateContentMethod.mock.calls[0].arguments[0];
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
      const requestConfig =
        mockGenerateContentMethod.mock.calls[0].arguments[0];
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
        },
      });

      // Assert
      assert.strictEqual(mockGenerateContentMethod.mock.calls.length, 1);
      const requestConfig =
        mockGenerateContentMethod.mock.calls[0].arguments[0];
      assert.ok(requestConfig.thinkingConfig, "Should have thinkingConfig");
      assert.strictEqual(
        requestConfig.thinkingConfig.thinkingBudget,
        configThinkingBudget,
        "Should prioritize generationConfig thinking budget"
      );
    });
  });

  describe("GeminiChatService", () => {
    // Mock for chat service
    const mockChatGenerateContentMethod = mock.fn(
      (): GenerateContentResponse => ({
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: "Mock chat response" }],
            },
            finishReason: "STOP",
          },
        ],
        text: () => "Mock chat response",
        promptFeedback: {},
      })
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
        },
      });

      await chatService.sendMessageToSession({
        sessionId,
        message: "Hello",
      });

      // Assert
      assert.strictEqual(mockChatGenerateContentMethod.mock.calls.length, 1);
      const requestConfig =
        mockChatGenerateContentMethod.mock.calls[0].arguments[0];
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
          },
        });

        await chatService.sendMessageToSession({
          sessionId,
          message: "Hello",
        });

        // Assert
        assert.strictEqual(mockChatGenerateContentMethod.mock.calls.length, 1);
        const requestConfig =
          mockChatGenerateContentMethod.mock.calls[0].arguments[0];
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
        },
      });

      await chatService.sendMessageToSession({
        sessionId,
        message: "Hello",
        generationConfig: {
          thinkingConfig: {
            thinkingBudget: 8000,
          },
        },
      });

      // Assert
      assert.strictEqual(mockChatGenerateContentMethod.mock.calls.length, 1);
      const requestConfig =
        mockChatGenerateContentMethod.mock.calls[0].arguments[0];
      assert.ok(requestConfig.thinkingConfig, "Should have thinkingConfig");
      assert.strictEqual(
        requestConfig.thinkingConfig.thinkingBudget,
        8000,
        "Should override session thinking budget with message thinking budget"
      );
    });
  });
});
