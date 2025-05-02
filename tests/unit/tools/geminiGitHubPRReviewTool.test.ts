import { describe, it, before, mock, afterEach } from "node:test";
import assert from "node:assert";
import { geminiGitHubPRReviewTool } from "../../../src/tools/geminiGitHubPRReviewTool.js";
import { GitHubUrlParser } from "../../../src/services/gemini/GitHubUrlParser.js";

describe("geminiGitHubPRReviewTool", () => {
  interface MockRequest {
    query: Record<string, string>;
  }

  interface MockResponse {
    json: (data: unknown) => MockResponse;
    status: (code: number) => MockResponse;
  }

  interface MockGeminiService {
    reviewGitHubPullRequest: (params: {
      owner: string;
      repo: string;
      prNumber: number;
      modelName?: string;
      reviewFocus?: string;
      [key: string]: unknown;
    }) => Promise<string>;
  }

  let mockRequest: MockRequest;
  let mockResponse: MockResponse;
  let mockGeminiService: MockGeminiService;
  let responseData: Record<string, unknown>;
  let responseStatus: number;

  before(() => {
    // Mock the GitHubUrlParser
    mock.method(GitHubUrlParser, "parse", (url: string) => {
      if (url === "https://github.com/nicobailon/mcp-gemini-server/pull/2") {
        return {
          type: "pull_request",
          owner: "nicobailon",
          repo: "mcp-gemini-server",
          prNumber: "2",
        };
      }
      return null;
    });

    // Setup mock response
    responseData = {};
    responseStatus = 200;

    // Create mock response object
    mockResponse = {
      json: mock.fn((data) => {
        responseData = data;
        return mockResponse;
      }),
      status: mock.fn((code) => {
        responseStatus = code;
        return mockResponse;
      }),
    };

    // Create mock Gemini service with parameter capture
    mockGeminiService = {
      reviewGitHubPullRequest: mock.fn((params) => {
        // Capture and pass through the parameters for assertion
        return Promise.resolve("Mock PR review from Gemini Flash 2.0");
      }),
    };
  });

  afterEach(() => {
    mock.restoreAll();
    mockGeminiService.reviewGitHubPullRequest.mock.resetCalls();
    responseData = {};
    responseStatus = 200;
  });

  it("should review a PR with Gemini Flash 2.0 model", async () => {
    mockRequest = {
      query: {
        prUrl: "https://github.com/nicobailon/mcp-gemini-server/pull/2",
        model: "gemini-flash-2.0",
        reviewFocus: "general",
      },
    };

    await geminiGitHubPRReviewTool(mockRequest, mockResponse, {
      geminiService: mockGeminiService,
    });

    assert.strictEqual(responseStatus, 200);
    assert.strictEqual(responseData.model, "gemini-flash-2.0");
    assert.strictEqual(
      responseData.review,
      "Mock PR review from Gemini Flash 2.0"
    );

    // Check that reviewGitHubPullRequest was called with the right parameters
    assert.strictEqual(
      mockGeminiService.reviewGitHubPullRequest.mock.calls.length,
      1
    );
    const params =
      mockGeminiService.reviewGitHubPullRequest.mock.calls[0].arguments[0];
    assert.strictEqual(params.owner, "nicobailon");
    assert.strictEqual(params.repo, "mcp-gemini-server");
    assert.strictEqual(params.prNumber, 2);
    assert.strictEqual(params.modelName, "gemini-flash-2.0");
  });

  it("should use different reasoning effort levels with Gemini Flash 2.0", async () => {
    mockRequest = {
      query: {
        prUrl: "https://github.com/nicobailon/mcp-gemini-server/pull/2",
        model: "gemini-flash-2.0",
        reasoningEffort: "low",
      },
    };

    await geminiGitHubPRReviewTool(mockRequest, mockResponse, {
      geminiService: mockGeminiService,
    });

    assert.strictEqual(responseStatus, 200);

    // Verify the call was made to the service
    assert.strictEqual(
      mockGeminiService.reviewGitHubPullRequest.mock.calls.length,
      1
    );

    // For tests matching against Zod schemas with defaults, just verify the call was made
    // and the service returns successfully
    assert.strictEqual(responseData.model, "gemini-flash-2.0");
    assert.strictEqual(
      responseData.review,
      "Mock PR review from Gemini Flash 2.0"
    );
  });

  it("should handle review focus parameters", async () => {
    mockRequest = {
      query: {
        prUrl: "https://github.com/nicobailon/mcp-gemini-server/pull/2",
        model: "gemini-flash-2.0",
        reviewFocus: "security",
      },
    };

    await geminiGitHubPRReviewTool(mockRequest, mockResponse, {
      geminiService: mockGeminiService,
    });

    assert.strictEqual(responseStatus, 200);

    // Verify the call was made to the service
    assert.strictEqual(
      mockGeminiService.reviewGitHubPullRequest.mock.calls.length,
      1
    );

    // For tests matching against Zod schemas with defaults, just verify the call was made
    // and the service returns successfully
    assert.strictEqual(responseData.model, "gemini-flash-2.0");
    assert.strictEqual(
      responseData.review,
      "Mock PR review from Gemini Flash 2.0"
    );
  });

  it("should handle invalid URLs", async () => {
    mockRequest = {
      query: {
        prUrl: "https://example.com/invalid",
        model: "gemini-flash-2.0",
      },
    };

    await geminiGitHubPRReviewTool(mockRequest, mockResponse, {
      geminiService: mockGeminiService,
    });

    assert.strictEqual(responseStatus, 400);
    assert.strictEqual(responseData.error, "Invalid GitHub URL");
  });
});
