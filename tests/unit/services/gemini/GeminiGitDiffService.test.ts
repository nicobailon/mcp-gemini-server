import { describe, it, before, mock, afterEach } from "node:test";
import assert from "node:assert";
import { GeminiGitDiffService } from "../../../../src/services/gemini/GeminiGitDiffService.js";
import { Content } from "../../../../src/services/gemini/GeminiTypes.js";

// Create a simple mock for gitdiff-parser
const mockParsedDiff = [
  {
    oldPath: "src/utils/logger.ts",
    newPath: "src/utils/logger.ts",
    hunks: [
      {
        oldStart: 1,
        oldLines: 5,
        newStart: 1,
        newLines: 6,
        changes: [
          { type: "normal", content: "const logger = {" },
          {
            type: "delete",
            content: "  log: (message: string) => console.log(message),",
          },
          {
            type: "insert",
            content:
              "  log: (message: string, ...args: any[]) => console.log(message, ...args),",
          },
          {
            type: "insert",
            content:
              "  debug: (message: string, ...args: any[]) => console.debug(message, ...args),",
          },
          {
            type: "normal",
            content:
              "  error: (message: string, error?: Error) => console.error(message, error)",
          },
          { type: "normal", content: "};" },
          { type: "normal", content: "" },
        ],
      },
    ],
  },
];

// Mock diff content
const mockDiffContent = `diff --git a/src/utils/logger.ts b/src/utils/logger.ts
index 1234567..abcdef0 100644
--- a/src/utils/logger.ts
+++ b/src/utils/logger.ts
@@ -1,5 +1,6 @@
 const logger = {
-  log: (message: string) => console.log(message),
+  log: (message: string, ...args: any[]) => console.log(message, ...args),
+  debug: (message: string, ...args: any[]) => console.debug(message, ...args),
   error: (message: string, error?: Error) => console.error(message, error)
 };
 
`;

describe("GeminiGitDiffService", () => {
  let mockGenAI: any;
  let mockModel: any;
  let mockResponse: any;
  let service: GeminiGitDiffService;

  // Setup test fixture
  before(() => {
    // Create mock response
    mockResponse = {
      response: {
        text: () => "This is a mock review response",
      },
    };

    // Create mock model
    mockModel = {
      generateContent: mock.fn(() => Promise.resolve(mockResponse)),
      generateContentStream: mock.fn(() => ({
        stream: {
          async *[Symbol.asyncIterator]() {
            yield { text: () => "Streamed chunk 1" };
            yield { text: () => "Streamed chunk 2" };
          },
        },
      })),
    };

    // Create mock GoogleGenAI
    mockGenAI = {
      getGenerativeModel: mock.fn(() => mockModel),
    };

    // Create a custom GeminiGitDiffService class for testing
    class TestGeminiGitDiffService extends GeminiGitDiffService {
      // Override the parseGitDiff method to avoid actual parsing
      protected async parseGitDiff(diffContent: string) {
        return mockParsedDiff as any;
      }
    }

    // Create service with flash model as default
    service = new TestGeminiGitDiffService(
      mockGenAI,
      "gemini-flash-2.0", // Use Gemini Flash 2.0 as default model
      1024 * 1024,
      ["package-lock.json", "*.min.js"]
    );
  });

  afterEach(() => {
    mock.restoreAll();
    if (mockGenAI && mockGenAI.getGenerativeModel) {
      mockGenAI.getGenerativeModel.mock.resetCalls();
    }
  });

  describe("reviewDiff", () => {
    it("should use Gemini Flash 2.0 model when no model is specified", async () => {
      // Call the service
      await service.reviewDiff({
        diffContent: mockDiffContent,
        reviewFocus: "general",
      });

      // Verify model called with correct parameters
      assert.strictEqual(mockGenAI.getGenerativeModel.mock.calls.length, 1);
      assert.strictEqual(
        mockGenAI.getGenerativeModel.mock.calls[0].arguments[0].model,
        "gemini-flash-2.0"
      );
    });

    it("should allow overriding the model", async () => {
      // Call the service with a different model
      await service.reviewDiff({
        diffContent: mockDiffContent,
        modelName: "gemini-pro", // Override the default model
        reviewFocus: "security",
      });

      // Verify model called with correct parameters
      assert.strictEqual(mockGenAI.getGenerativeModel.mock.calls.length, 1);
      assert.strictEqual(
        mockGenAI.getGenerativeModel.mock.calls[0].arguments[0].model,
        "gemini-pro"
      );
    });

    it("should set reasoning effort correctly", async () => {
      // Call with low reasoning effort
      await service.reviewDiff({
        diffContent: mockDiffContent,
        reasoningEffort: "low",
      });

      // Verify thinking budget set accordingly
      assert.strictEqual(mockGenAI.getGenerativeModel.mock.calls.length, 1);
      assert.strictEqual(
        mockGenAI.getGenerativeModel.mock.calls[0].arguments[0].generationConfig
          .thinkingBudget,
        2048
      );
    });
  });

  describe("reviewDiffStream", () => {
    it("should stream content chunks", async () => {
      const chunks: string[] = [];

      // Use for-await to consume the stream
      for await (const chunk of service.reviewDiffStream({
        diffContent: mockDiffContent,
        modelName: "gemini-flash-2.0",
      })) {
        chunks.push(chunk);
      }

      // Verify we got both chunks
      assert.strictEqual(chunks.length, 2);
      assert.strictEqual(chunks[0], "Streamed chunk 1");
      assert.strictEqual(chunks[1], "Streamed chunk 2");
    });
  });
});
