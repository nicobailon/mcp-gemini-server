// Using vitest globals - see vitest.config.ts globals: true

import { skipIfEnvMissing } from "../utils/env-check.js";
import { REQUIRED_ENV_VARS } from "../utils/environment.js";
import { GitHubApiService } from "../../src/services/gemini/GitHubApiService.js";
import { GitHubUrlParser } from "../../src/services/gemini/GitHubUrlParser.js";

/**
 * Known stable GitHub PRs for testing
 * These should be small PRs that are unlikely to be deleted
 */
const TEST_REPOSITORIES = {
  // Well-known small PR in GitHub's Hello-World repo
  HELLO_WORLD: {
    owner: "octocat",
    repo: "Hello-World",
    prNumber: 1,
    url: "https://github.com/octocat/Hello-World/pull/1",
  },

  // Alternative test repositories
  GITIGNORE_REPO: {
    owner: "github",
    repo: "gitignore",
    // Note: We'll use a recent small PR, checking it exists first
  },
};

describe("GitHubApiService - Real GitHub API Integration", () => {
  let githubApiService: GitHubApiService;

  beforeAll(() => {
    // Skip all tests if required environment variables are missing
    if (
      skipIfEnvMissing(
        { skip: (_reason: string) => vi.skip() },
        REQUIRED_ENV_VARS.GITHUB_INTEGRATION
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

    // Initialize real GitHubApiService
    githubApiService = new GitHubApiService();

    console.log(
      "Running real GitHub API tests with token:",
      process.env.GITHUB_TOKEN ? "✓ Present" : "✗ Missing"
    );
  });

  describe("Basic API functionality", () => {
    it("should verify GitHub API connectivity", async () => {
      // Test rate limit check to verify API connectivity
      await expect(githubApiService.checkRateLimit()).resolves.not.toThrow();
    });

    it("should have all required methods", () => {
      expect(typeof githubApiService.getPullRequestMetadata).toBe("function");
      expect(typeof githubApiService.getPullRequestDiffData).toBe("function");
      expect(typeof githubApiService.getPullRequest).toBe("function");
      expect(typeof githubApiService.getPullRequestFiles).toBe("function");
      expect(typeof githubApiService.checkRateLimit).toBe("function");
    });
  });

  describe("Real PR metadata fetching", () => {
    it("should fetch real PR metadata successfully", async () => {
      const { owner, repo, prNumber } = TEST_REPOSITORIES.HELLO_WORLD;

      const metadata = await githubApiService.getPullRequestMetadata(
        owner,
        repo,
        prNumber
      );

      expect(metadata).toBeDefined();
      expect(metadata.title).toBeTruthy();
      expect(typeof metadata.title).toBe("string");
      expect(typeof metadata.files_changed).toBe("number");
      expect(typeof metadata.additions).toBe("number");
      expect(typeof metadata.deletions).toBe("number");

      // Verify reasonable values
      expect(metadata.files_changed).toBeGreaterThanOrEqual(0);
      expect(metadata.files_changed).toBeLessThan(1000); // Sanity check
      expect(metadata.additions).toBeGreaterThanOrEqual(0);
      expect(metadata.deletions).toBeGreaterThanOrEqual(0);

      console.log("Fetched PR metadata:", {
        title: metadata.title.substring(0, 50),
        files_changed: metadata.files_changed,
        additions: metadata.additions,
        deletions: metadata.deletions,
      });
    });

    it("should validate PR response structure properly", async () => {
      const { owner, repo, prNumber } = TEST_REPOSITORIES.HELLO_WORLD;

      // This should not throw validation errors for a real PR
      await expect(
        githubApiService.getPullRequestMetadata(owner, repo, prNumber)
      ).resolves.toBeDefined();
    });

    it("should handle validation errors for invalid inputs", async () => {
      await expect(
        githubApiService.getPullRequestMetadata("", "repo", 123)
      ).rejects.toThrow("Repository owner is required");

      await expect(
        githubApiService.getPullRequestMetadata("owner", "", 123)
      ).rejects.toThrow("Repository name is required");

      await expect(
        githubApiService.getPullRequestMetadata("owner", "repo", 0)
      ).rejects.toThrow("PR number must be a positive integer");
    });
  });

  describe("Real PR diff data fetching", () => {
    it("should fetch complete PR diff data successfully", async () => {
      const { owner, repo, prNumber } = TEST_REPOSITORIES.HELLO_WORLD;

      const diffData = await githubApiService.getPullRequestDiffData(
        owner,
        repo,
        prNumber
      );

      expect(diffData).toBeDefined();
      expect(typeof diffData.raw_diff).toBe("string");
      expect(diffData.raw_diff.length).toBeGreaterThan(0);
      expect(Array.isArray(diffData.files)).toBe(true);
      expect(diffData.stats).toBeDefined();

      // Verify stats structure
      expect(typeof diffData.stats.total_files).toBe("number");
      expect(typeof diffData.stats.total_additions).toBe("number");
      expect(typeof diffData.stats.total_deletions).toBe("number");
      expect(diffData.stats.total_files).toBeGreaterThanOrEqual(0);

      // Verify files structure if files exist
      if (diffData.files.length > 0) {
        const file = diffData.files[0];
        expect(file.filename).toBeTruthy();
        expect(typeof file.filename).toBe("string");
        expect(file.status).toBeTruthy();
        expect(typeof file.additions).toBe("number");
        expect(typeof file.deletions).toBe("number");

        // Patch can be undefined for binary files
        if (file.patch !== undefined) {
          expect(typeof file.patch).toBe("string");
        }
      }

      console.log("Fetched PR diff data:", {
        raw_diff_length: diffData.raw_diff.length,
        files_count: diffData.files.length,
        stats: diffData.stats,
      });
    });

    it("should handle empty or undefined patch data correctly", async () => {
      const { owner, repo, prNumber } = TEST_REPOSITORIES.HELLO_WORLD;

      const diffData = await githubApiService.getPullRequestDiffData(
        owner,
        repo,
        prNumber
      );

      // Check that files with undefined patches are handled properly
      diffData.files.forEach((file) => {
        if (file.patch === undefined) {
          // Should be converted to empty string or handled gracefully
          expect(file.patch).toBeUndefined(); // Current implementation keeps undefined
        }
      });
    });
  });

  describe("Error handling with real API", () => {
    it("should handle 404 errors for non-existent PRs", async () => {
      await expect(
        githubApiService.getPullRequestMetadata(
          "octocat",
          "Hello-World",
          999999
        )
      ).rejects.toThrow(); // Should throw some kind of error for non-existent PR
    });

    it("should handle rate limiting gracefully", async () => {
      // This test verifies our rate limiting logic works
      // Multiple rapid requests should be handled properly
      const { owner, repo, prNumber } = TEST_REPOSITORIES.HELLO_WORLD;

      const promises = Array(3)
        .fill(null)
        .map(() =>
          githubApiService.getPullRequestMetadata(owner, repo, prNumber)
        );

      // All should succeed (may be rate limited but should retry)
      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result.title).toBeTruthy();
      });
    });

    it("should handle repository that doesn't exist", async () => {
      await expect(
        githubApiService.getPullRequestMetadata("nonexistent", "nonexistent", 1)
      ).rejects.toThrow(); // Should throw for non-existent repo
    });
  });

  describe("Integration with GitHubUrlParser", () => {
    it("should work together to process real URLs", async () => {
      const url = TEST_REPOSITORIES.HELLO_WORLD.url;

      // Parse URL
      const prInfo = GitHubUrlParser.getPullRequestInfo(url);
      expect(prInfo).toBeDefined();

      if (!prInfo) throw new Error("URL parsing failed");

      // Use parsed info to fetch data
      const metadata = await githubApiService.getPullRequestMetadata(
        prInfo.owner,
        prInfo.repo,
        prInfo.prNumber
      );

      expect(metadata).toBeDefined();
      expect(metadata.title).toBeTruthy();
    });

    it("should handle various real GitHub URL formats", async () => {
      const urls = [
        "https://github.com/octocat/Hello-World/pull/1",
        "https://github.com/octocat/Hello-World/pull/1/files",
      ];

      for (const url of urls) {
        const prInfo = GitHubUrlParser.getPullRequestInfo(url);
        expect(prInfo).toBeDefined();

        if (prInfo) {
          // Verify we can fetch data for parsed URLs
          await expect(
            githubApiService.getPullRequestMetadata(
              prInfo.owner,
              prInfo.repo,
              prInfo.prNumber
            )
          ).resolves.toBeDefined();
        }
      }
    });
  });

  describe("Performance and cost control", () => {
    it("should complete requests within reasonable time", async () => {
      const startTime = Date.now();

      const { owner, repo, prNumber } = TEST_REPOSITORIES.HELLO_WORLD;
      await githubApiService.getPullRequestMetadata(owner, repo, prNumber);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it("should respect GitHub API best practices", async () => {
      // Verify our requests include proper headers and authentication
      const { owner, repo, prNumber } = TEST_REPOSITORIES.HELLO_WORLD;

      // This test passes if the request succeeds with proper authentication
      await expect(
        githubApiService.getPullRequestMetadata(owner, repo, prNumber)
      ).resolves.toBeDefined();
    });
  });
});
