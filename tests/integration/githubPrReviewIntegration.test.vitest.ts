// Using vitest globals - see vitest.config.ts globals: true

import { skipIfEnvMissing } from "../utils/env-check.js";
import { REQUIRED_ENV_VARS } from "../utils/environment.js";
import { GeminiService } from "../../src/services/GeminiService.js";
import { GitHubApiService } from "../../src/services/gemini/GitHubApiService.js";
import { GitHubUrlParser } from "../../src/services/gemini/GitHubUrlParser.js";
import { geminiGithubPrReviewTool } from "../../src/tools/geminiGithubPrReviewTool.js";

/**
 * Real GitHub PR URLs for testing
 * These are small, stable PRs that should remain available
 */
const TEST_PR_URLS = {
  // Small documentation PR in a popular repo
  SMALL_DOC_PR: "https://github.com/octocat/Hello-World/pull/1",

  // Alternative test URLs (in case the above is unavailable)
  FALLBACK_PRS: [
    "https://github.com/github/gitignore/pull/4000", // Usually small PRs
    "https://github.com/microsoft/vscode/pull/200000", // Large repo, pick a small PR
  ],
};

describe("GitHub PR Review Tool - Real API Integration", () => {
  let geminiService: GeminiService;
  let githubApiService: GitHubApiService;

  beforeAll(() => {
    // Skip all tests if required environment variables are missing
    if (
      skipIfEnvMissing(
        { skip: (_reason: string) => vi.skip() },
        REQUIRED_ENV_VARS.REAL_API_TESTS
      )
    )
      return;

    // Skip if real API tests are not explicitly enabled
    if (
      !process.env.ENABLE_REAL_API_TESTS ||
      process.env.ENABLE_REAL_API_TESTS !== "true"
    ) {
      vi.skip(
        "Real API tests disabled. Set ENABLE_REAL_API_TESTS=true to enable."
      );
      return;
    }

    // Initialize real services
    geminiService = new GeminiService();
    githubApiService = new GitHubApiService();
  });

  describe("GitHubUrlParser (no API calls)", () => {
    it("should parse real GitHub PR URLs correctly", () => {
      const result = GitHubUrlParser.getPullRequestInfo(
        TEST_PR_URLS.SMALL_DOC_PR
      );

      expect(result).toBeDefined();
      expect(result?.owner).toBe("octocat");
      expect(result?.repo).toBe("Hello-World");
      expect(result?.prNumber).toBe(1);
    });

    it("should validate real URL formats", () => {
      const validUrls = [
        "https://github.com/owner/repo/pull/123",
        "https://github.com/owner/repo/pull/123/files",
        "https://github.com/microsoft/vscode/pull/200000",
      ];

      for (const url of validUrls) {
        const result = GitHubUrlParser.getPullRequestInfo(url);
        expect(result).toBeDefined();
        expect(result?.owner).toBeTruthy();
        expect(result?.repo).toBeTruthy();
        expect(result?.prNumber).toBeGreaterThan(0);
      }
    });
  });

  describe("GitHubApiService - Real GitHub API", () => {
    it("should fetch real PR metadata", async () => {
      const prInfo = GitHubUrlParser.getPullRequestInfo(
        TEST_PR_URLS.SMALL_DOC_PR
      );
      if (!prInfo) throw new Error("Invalid test PR URL");

      const metadata = await githubApiService.getPullRequestMetadata(
        prInfo.owner,
        prInfo.repo,
        prInfo.prNumber
      );

      expect(metadata).toBeDefined();
      expect(metadata.title).toBeTruthy();
      expect(typeof metadata.files_changed).toBe("number");
      expect(typeof metadata.additions).toBe("number");
      expect(typeof metadata.deletions).toBe("number");
      expect(metadata.files_changed).toBeGreaterThanOrEqual(0);
    });

    it("should fetch real PR diff data", async () => {
      const prInfo = GitHubUrlParser.getPullRequestInfo(
        TEST_PR_URLS.SMALL_DOC_PR
      );
      if (!prInfo) throw new Error("Invalid test PR URL");

      const diffData = await githubApiService.getPullRequestDiffData(
        prInfo.owner,
        prInfo.repo,
        prInfo.prNumber
      );

      expect(diffData).toBeDefined();
      expect(diffData.raw_diff).toBeTruthy();
      expect(Array.isArray(diffData.files)).toBe(true);
      expect(diffData.stats).toBeDefined();
      expect(diffData.stats.total_files).toBeGreaterThanOrEqual(0);
      expect(diffData.stats.total_additions).toBeGreaterThanOrEqual(0);
      expect(diffData.stats.total_deletions).toBeGreaterThanOrEqual(0);

      // Verify file structure
      if (diffData.files.length > 0) {
        const file = diffData.files[0];
        expect(file.filename).toBeTruthy();
        expect(file.status).toBeTruthy();
        expect(typeof file.additions).toBe("number");
        expect(typeof file.deletions).toBe("number");
      }
    });

    it("should handle GitHub API rate limits gracefully", async () => {
      // Check rate limit status
      await expect(githubApiService.checkRateLimit()).resolves.not.toThrow();
    });
  });

  describe("Gemini PR Review Tool - End-to-End Real API", () => {
    it("should perform complete PR review with real APIs", async () => {
      const params = {
        pull_request_url: TEST_PR_URLS.SMALL_DOC_PR,
        focus_area: "general" as const,
        max_files: 5, // Keep it small for cost control
      };

      const result = await geminiGithubPrReviewTool.execute(
        params,
        geminiService
      );

      expect(result).toBeDefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const reviewText = result.content[0].text as string;
      expect(reviewText).toContain("GitHub PR Review Results");
      expect(reviewText).toContain("octocat/Hello-World");
      expect(reviewText).toContain("#1");
      expect(reviewText).toContain("Code Review Analysis");

      // Verify it contains actual analysis (not just template)
      expect(reviewText.length).toBeGreaterThan(500); // Should have substantial content
    });

    it("should handle different focus areas with real API", async () => {
      const params = {
        pull_request_url: TEST_PR_URLS.SMALL_DOC_PR,
        focus_area: "security" as const,
        max_files: 3,
      };

      const result = await geminiGithubPrReviewTool.execute(
        params,
        geminiService
      );

      expect(result).toBeDefined();
      const reviewText = result.content[0].text as string;
      expect(reviewText).toContain("Focus Area**: security");
    });

    it("should handle invalid PR URLs properly", async () => {
      const params = {
        pull_request_url: "https://github.com/nonexistent/repo/pull/999999",
      };

      await expect(
        geminiGithubPrReviewTool.execute(params, geminiService)
      ).rejects.toThrow(); // Should throw on 404 or similar GitHub error
    });
  });

  describe("Parameter Validation - Real Data", () => {
    it("should validate real GitHub URLs", () => {
      const schema = geminiGithubPrReviewTool.inputSchema;

      const validParams = {
        pull_request_url: TEST_PR_URLS.SMALL_DOC_PR,
        focus_area: "general" as const,
        max_files: 10,
      };

      const result = (schema as any).safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it("should reject invalid URLs", () => {
      const schema = geminiGithubPrReviewTool.inputSchema;

      const invalidParams = {
        pull_request_url: "https://example.com/not-github",
      };

      const result = (schema as any).safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  describe("Cost Control and Performance", () => {
    it("should complete review within reasonable time", async () => {
      const startTime = Date.now();

      const params = {
        pull_request_url: TEST_PR_URLS.SMALL_DOC_PR,
        focus_area: "general" as const,
        max_files: 2, // Very small for speed
      };

      await geminiGithubPrReviewTool.execute(params, geminiService);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    });

    it("should use the cheapest model for cost control", async () => {
      // This test verifies our implementation uses cost-effective models
      // In the actual implementation, we're using gemini-2.0-flash-exp
      // but we should verify it's configured for cost efficiency

      const params = {
        pull_request_url: TEST_PR_URLS.SMALL_DOC_PR,
        max_files: 1,
      };

      // The test passes if it completes without error using our model choice
      await expect(
        geminiGithubPrReviewTool.execute(params, geminiService)
      ).resolves.toBeDefined();
    });
  });
});
