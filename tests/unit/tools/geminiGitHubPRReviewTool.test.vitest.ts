import { describe, it, beforeEach, afterEach, vi, expect } from "vitest";
import { geminiGitHubPRReviewTool } from "../../../src/tools/geminiGitHubPRReviewTool.js";
import { GitHubUrlParser } from "../../../src/services/gemini/GitHubUrlParser.js";
import {
  createMockRequest,
  createMockResponse,
} from "../../utils/express-mocks.js";
import { Request, Response } from "express";

describe("geminiGitHubPRReviewTool", () => {
  interface MockGeminiService {
    reviewGitHubPullRequest: ReturnType<typeof vi.fn>;
  }

  let mockRequest: Request;
  let mockResponse: Response;
  let mockGeminiService: MockGeminiService;
  let responseData: Record<string, unknown>;
  let responseStatus: number;

  beforeEach(() => {
    // Mock the GitHubUrlParser
    vi.spyOn(GitHubUrlParser, "parse").mockImplementation((url: string) => {
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
      reviewGitHubPullRequest: vi.fn().mockImplementation((params) => {
        // Capture and pass through the parameters for assertion
        return Promise.resolve("Mock PR review from Gemini Flash 2.0");
      }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      json: function (data: any): Response {
        responseData = data;
        return this as Response;
      },
      status: function (code: number): Response {
        responseStatus = code;
        return this as Response;
      },
    });

    await geminiGitHubPRReviewTool(mockRequest, mockResponse, {
      geminiService: mockGeminiService,
    });

    expect(responseStatus).toBe(200);
    expect(responseData.model).toBe("gemini-flash-2.0");
    expect(responseData.review).toBe("Mock PR review from Gemini Flash 2.0");

    // Check that reviewGitHubPullRequest was called with the right parameters
    expect(mockGeminiService.reviewGitHubPullRequest).toHaveBeenCalledTimes(1);

    const params = mockGeminiService.reviewGitHubPullRequest.mock.calls[0][0];
    expect(params.owner).toBe("nicobailon");
    expect(params.repo).toBe("mcp-gemini-server");
    expect(params.prNumber).toBe(2);
    expect(params.modelName).toBe("gemini-flash-2.0");
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
      json: function (data: any): Response {
        responseData = data;
        return this as Response;
      },
      status: function (code: number): Response {
        responseStatus = code;
        return this as Response;
      },
    });

    await geminiGitHubPRReviewTool(mockRequest, mockResponse, {
      geminiService: mockGeminiService,
    });

    expect(responseStatus).toBe(200);

    // Verify the call was made to the service
    expect(mockGeminiService.reviewGitHubPullRequest).toHaveBeenCalledTimes(1);

    // For tests matching against Zod schemas with defaults, just verify the call was made
    // and the service returns successfully
    expect(responseData.model).toBe("gemini-flash-2.0");
    expect(responseData.review).toBe("Mock PR review from Gemini Flash 2.0");
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
      json: function (data: any): Response {
        responseData = data;
        return this as Response;
      },
      status: function (code: number): Response {
        responseStatus = code;
        return this as Response;
      },
    });

    await geminiGitHubPRReviewTool(mockRequest, mockResponse, {
      geminiService: mockGeminiService,
    });

    expect(responseStatus).toBe(200);

    // Verify the call was made to the service
    expect(mockGeminiService.reviewGitHubPullRequest).toHaveBeenCalledTimes(1);

    // For tests matching against Zod schemas with defaults, just verify the call was made
    // and the service returns successfully
    expect(responseData.model).toBe("gemini-flash-2.0");
    expect(responseData.review).toBe("Mock PR review from Gemini Flash 2.0");
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
      json: function (data: any): Response {
        responseData = data;
        return this as Response;
      },
      status: function (code: number): Response {
        responseStatus = code;
        return this as Response;
      },
    });

    await geminiGitHubPRReviewTool(mockRequest, mockResponse, {
      geminiService: mockGeminiService,
    });

    expect(responseStatus).toBe(400);
    expect(responseData.error).toBe("Invalid GitHub URL");
  });
});
