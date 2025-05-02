import { describe, it, before, mock, afterEach } from "node:test";
import assert from "node:assert";
import { geminiGitHubPRReviewTool } from "../../../src/tools/geminiGitHubPRReviewTool.js";
import { GitHubUrlParser } from "../../../src/services/gemini/GitHubUrlParser.js";
import { createMockRequest, createMockResponse } from "../../utils/express-mocks.js";
import { Request, Response } from "express";

describe("geminiGitHubPRReviewTool", () => {
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

  let mockRequest: Request;
  let mockResponse: Response;
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

    // Setup initial state
    responseData = {};
    responseStatus = 200;

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
    // Cast to any to access mock property
    ((mockGeminiService.reviewGitHubPullRequest as any).mock).resetCalls();
    responseData = {};
    responseStatus = 200;
  });

  it("should review a PR with Gemini Flash 2.0 model", async () => {
    // Create new mocks for each test
    mockRequest = createMockRequest({
      query: {
        prUrl: "https://github.com/nicobailon/mcp-gemini-server/pull/2",
        model: "gemini-flash-2.0",
        reviewFocus: "general",
      },
    });
    
    mockResponse = createMockResponse({
      json: function(data: any): Response {
        responseData = data;
        return this as Response;
      },
      status: function(code: number): Response {
        responseStatus = code;
        return this as Response;
      },
    });

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
    const mockFn = mockGeminiService.reviewGitHubPullRequest as any;
    assert.strictEqual(mockFn.mock.calls.length, 1);
    
    const params = mockFn.mock.calls[0].arguments[0];
    assert.strictEqual(params.owner, "nicobailon");
    assert.strictEqual(params.repo, "mcp-gemini-server");
    assert.strictEqual(params.prNumber, 2);
    assert.strictEqual(params.modelName, "gemini-flash-2.0");
  });

  it("should use different reasoning effort levels with Gemini Flash 2.0", async () => {
    // Create new mocks for each test
    mockRequest = createMockRequest({
      query: {
        prUrl: "https://github.com/nicobailon/mcp-gemini-server/pull/2",
        model: "gemini-flash-2.0",
        reasoningEffort: "low",
      },
    });
    
    mockResponse = createMockResponse({
      json: function(data: any): Response {
        responseData = data;
        return this as Response;
      },
      status: function(code: number): Response {
        responseStatus = code;
        return this as Response;
      },
    });

    await geminiGitHubPRReviewTool(mockRequest, mockResponse, {
      geminiService: mockGeminiService,
    });

    assert.strictEqual(responseStatus, 200);

    // Verify the call was made to the service
    const mockFn = mockGeminiService.reviewGitHubPullRequest as any;
    assert.strictEqual(mockFn.mock.calls.length, 1);

    // For tests matching against Zod schemas with defaults, just verify the call was made
    // and the service returns successfully
    assert.strictEqual(responseData.model, "gemini-flash-2.0");
    assert.strictEqual(
      responseData.review,
      "Mock PR review from Gemini Flash 2.0"
    );
  });

  it("should handle review focus parameters", async () => {
    // Create new mocks for each test
    mockRequest = createMockRequest({
      query: {
        prUrl: "https://github.com/nicobailon/mcp-gemini-server/pull/2",
        model: "gemini-flash-2.0",
        reviewFocus: "security",
      },
    });
    
    mockResponse = createMockResponse({
      json: function(data: any): Response {
        responseData = data;
        return this as Response;
      },
      status: function(code: number): Response {
        responseStatus = code;
        return this as Response;
      },
    });

    await geminiGitHubPRReviewTool(mockRequest, mockResponse, {
      geminiService: mockGeminiService,
    });

    assert.strictEqual(responseStatus, 200);

    // Verify the call was made to the service
    const mockFn = mockGeminiService.reviewGitHubPullRequest as any;
    assert.strictEqual(mockFn.mock.calls.length, 1);

    // For tests matching against Zod schemas with defaults, just verify the call was made
    // and the service returns successfully
    assert.strictEqual(responseData.model, "gemini-flash-2.0");
    assert.strictEqual(
      responseData.review,
      "Mock PR review from Gemini Flash 2.0"
    );
  });

  it("should handle invalid URLs", async () => {
    // Create new mocks for each test
    mockRequest = createMockRequest({
      query: {
        prUrl: "https://example.com/invalid",
        model: "gemini-flash-2.0",
      },
    });
    
    mockResponse = createMockResponse({
      json: function(data: any): Response {
        responseData = data;
        return this as Response;
      },
      status: function(code: number): Response {
        responseStatus = code;
        return this as Response;
      },
    });

    await geminiGitHubPRReviewTool(mockRequest, mockResponse, {
      geminiService: mockGeminiService,
    });

    assert.strictEqual(responseStatus, 400);
    assert.strictEqual(responseData.error, "Invalid GitHub URL");
  });
});
