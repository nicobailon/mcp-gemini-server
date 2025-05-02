import { describe, it, before, mock, afterEach } from "node:test";
import assert from "node:assert";
import { GitHubApiService } from "../../../../src/services/gemini/GitHubApiService.js";
import { ConfigurationManager } from "../../../../src/config/ConfigurationManager.js";

// Mock ConfigurationManager
mock.method(ConfigurationManager, "getInstance", () => ({
  getGitHubApiToken: () => "mock-token",
}));

describe("GitHubApiService", () => {
  let service: GitHubApiService;
  let mockOctokit: any;
  let mockGraphql: any;

  before(() => {
    // Create mock implementation for Octokit
    mockOctokit = {
      rateLimit: {
        get: mock.fn(() => ({
          data: {
            resources: {
              core: {
                limit: 5000,
                remaining: 4500,
                reset: Math.floor(Date.now() / 1000) + 3600,
              },
            },
          },
        })),
      },
      repos: {
        getContent: mock.fn(),
        get: mock.fn(),
      },
      pulls: {
        get: mock.fn(),
        listFiles: mock.fn(),
      },
      request: mock.fn(),
    };

    // Mock graphql function
    mockGraphql = mock.fn(() => ({
      repository: {
        name: "mcp-gemini-server",
        description: "Mock repo description",
        defaultBranchRef: { name: "main" },
        primaryLanguage: { name: "TypeScript" },
        languages: {
          edges: [
            {
              node: { name: "TypeScript" },
              size: 80000,
            },
            {
              node: { name: "JavaScript" },
              size: 20000,
            },
          ],
          totalSize: 100000,
        },
        stargazerCount: 100,
        forkCount: 20,
        issues: { totalCount: 5 },
        pullRequests: { totalCount: 2 },
        updatedAt: new Date().toISOString(),
      },
    }));

    // Mock Octokit and graphql imports
    mock.module("@octokit/rest", () => ({
      Octokit: function () {
        return mockOctokit;
      },
    }));

    mock.module("@octokit/graphql", () => ({
      graphql: mockGraphql,
      defaults: () => mockGraphql,
    }));

    // Create the service with mock dependencies
    service = new GitHubApiService(undefined, false); // No caching for tests
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe("getPullRequestDiff", () => {
    it("should fetch a pull request diff", async () => {
      const mockDiff =
        "diff --git a/file.ts b/file.ts\nindex 123..456 789\n--- a/file.ts\n+++ b/file.ts";

      // Mock the request response
      mockOctokit.request.mockImplementation(() =>
        Promise.resolve({ data: mockDiff })
      );

      const result = await service.getPullRequestDiff("owner", "repo", 123);

      // Verify the request was made correctly
      assert.strictEqual(mockOctokit.request.mock.calls.length, 1);
      assert.strictEqual(result, mockDiff);

      // Check the request parameters
      const requestArgs = mockOctokit.request.mock.calls[0].arguments;
      assert.strictEqual(
        requestArgs[0],
        "GET /repos/{owner}/{repo}/pulls/{pull_number}"
      );
      assert.strictEqual(requestArgs[1].owner, "owner");
      assert.strictEqual(requestArgs[1].repo, "repo");
      assert.strictEqual(requestArgs[1].pull_number, 123);
      assert.strictEqual(
        requestArgs[1].headers.accept,
        "application/vnd.github.v3.diff"
      );
    });
  });

  describe("getRepositoryOverview", () => {
    it("should return processed repository information", async () => {
      const result = await service.getRepositoryOverview("owner", "repo");

      // Verify GraphQL was called
      assert.strictEqual(mockGraphql.mock.calls.length, 1);

      // Verify the result structure
      assert.strictEqual(result.name, "mcp-gemini-server");
      assert.strictEqual(result.language, "TypeScript");
      assert.strictEqual(result.defaultBranch, "main");
      assert.strictEqual(result.languages.length, 2);
      assert.strictEqual(result.languages[0].name, "TypeScript");
      assert.strictEqual(result.languages[0].percentage, 80);
    });
  });
});
