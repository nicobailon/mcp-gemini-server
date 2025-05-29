// Using vitest globals - see vitest.config.ts globals: true

import { GitHubUrlParser } from "../../src/services/gemini/GitHubUrlParser.js";

/**
 * Real GitHub URLs for comprehensive testing
 * These test against actual GitHub URL patterns and formats
 */
const REAL_GITHUB_URLS = {
  REPOSITORIES: [
    "https://github.com/microsoft/vscode",
    "https://github.com/facebook/react",
    "https://github.com/octocat/Hello-World",
    "https://github.com/github/gitignore",
  ],

  BRANCHES: [
    "https://github.com/microsoft/vscode/tree/main",
    "https://github.com/facebook/react/tree/v18.2.0",
    "https://github.com/octocat/Hello-World/tree/master",
    "https://github.com/github/docs/tree/main/content",
  ],

  PULL_REQUESTS: [
    "https://github.com/octocat/Hello-World/pull/1",
    "https://github.com/microsoft/vscode/pull/200000",
    "https://github.com/facebook/react/pull/25000",
    "https://github.com/github/gitignore/pull/4000",
  ],

  PR_FILES: [
    "https://github.com/octocat/Hello-World/pull/1/files",
    "https://github.com/microsoft/vscode/pull/200000/files",
    "https://github.com/facebook/react/pull/25000/files",
  ],

  ISSUES: [
    "https://github.com/microsoft/vscode/issues/100000",
    "https://github.com/facebook/react/issues/25000",
    "https://github.com/octocat/Hello-World/issues/1",
  ],

  INVALID_URLS: [
    "https://example.com/owner/repo/pull/123",
    "https://github.com/owner/repo",
    "https://github.com/owner/repo/issues/123",
    "https://github.com/owner/repo/pull/abc",
    "https://github.com/owner/repo/pull/0",
    "https://github.com/owner/repo/pull/-1",
    "not a url",
    "",
    "https://github.com/owner/repo/pull/123/commits", // Not supported
    "https://gitlab.com/owner/repo/pull/123", // Wrong platform
  ],
};

describe("GitHubUrlParser - Real URL Integration Tests", () => {
  describe("Repository URL parsing", () => {
    it("should parse real repository URLs correctly", () => {
      for (const url of REAL_GITHUB_URLS.REPOSITORIES) {
        const result = GitHubUrlParser.parse(url);

        expect(result).toBeDefined();
        expect(result?.type).toBe("repository");
        expect(result?.owner).toBeTruthy();
        expect(result?.repo).toBeTruthy();
        expect(result?.branch).toBeUndefined();
        expect(result?.prNumber).toBeUndefined();
        expect(result?.issueNumber).toBeUndefined();

        console.log(`✓ Parsed repository: ${result?.owner}/${result?.repo}`);
      }
    });

    it("should extract correct owner/repo from real URLs", () => {
      const expectedMappings = [
        {
          url: "https://github.com/microsoft/vscode",
          owner: "microsoft",
          repo: "vscode",
        },
        {
          url: "https://github.com/facebook/react",
          owner: "facebook",
          repo: "react",
        },
        {
          url: "https://github.com/octocat/Hello-World",
          owner: "octocat",
          repo: "Hello-World",
        },
      ];

      for (const { url, owner, repo } of expectedMappings) {
        const result = GitHubUrlParser.parse(url);
        expect(result?.owner).toBe(owner);
        expect(result?.repo).toBe(repo);
      }
    });
  });

  describe("Branch URL parsing", () => {
    it("should parse real branch URLs correctly", () => {
      for (const url of REAL_GITHUB_URLS.BRANCHES) {
        const result = GitHubUrlParser.parse(url);

        expect(result).toBeDefined();
        expect(result?.type).toBe("branch");
        expect(result?.owner).toBeTruthy();
        expect(result?.repo).toBeTruthy();
        expect(result?.branch).toBeTruthy();
        expect(result?.prNumber).toBeUndefined();
        expect(result?.issueNumber).toBeUndefined();

        console.log(
          `✓ Parsed branch: ${result?.owner}/${result?.repo}#${result?.branch}`
        );
      }
    });

    it("should handle complex branch names correctly", () => {
      const complexBranchUrls = [
        "https://github.com/microsoft/vscode/tree/feature/add-new-feature",
        "https://github.com/facebook/react/tree/fix/issue-123",
        "https://github.com/owner/repo/tree/release/v1.2.3",
      ];

      for (const url of complexBranchUrls) {
        const result = GitHubUrlParser.parse(url);
        expect(result?.type).toBe("branch");
        expect(result?.branch).toBeTruthy();
        expect(result?.branch).toContain("/"); // Contains path separators
      }
    });
  });

  describe("Pull Request URL parsing", () => {
    it("should parse real PR URLs correctly", () => {
      for (const url of REAL_GITHUB_URLS.PULL_REQUESTS) {
        const result = GitHubUrlParser.parse(url);

        expect(result).toBeDefined();
        expect(result?.type).toBe("pull_request");
        expect(result?.owner).toBeTruthy();
        expect(result?.repo).toBeTruthy();
        expect(result?.prNumber).toBeTruthy();
        expect(result?.branch).toBeUndefined();
        expect(result?.issueNumber).toBeUndefined();

        // Verify PR number is numeric
        const prNum = parseInt(result?.prNumber || "0", 10);
        expect(prNum).toBeGreaterThan(0);

        console.log(
          `✓ Parsed PR: ${result?.owner}/${result?.repo}#${result?.prNumber}`
        );
      }
    });

    it("should parse PR files URLs correctly", () => {
      for (const url of REAL_GITHUB_URLS.PR_FILES) {
        const result = GitHubUrlParser.parse(url);

        expect(result).toBeDefined();
        expect(result?.type).toBe("pr_files");
        expect(result?.owner).toBeTruthy();
        expect(result?.repo).toBeTruthy();
        expect(result?.prNumber).toBeTruthy();
        expect((result as any)?.filesView).toBe(true);

        console.log(
          `✓ Parsed PR files: ${result?.owner}/${result?.repo}#${result?.prNumber}/files`
        );
      }
    });

    it("should handle various PR number ranges", () => {
      const prNumbers = [
        { url: "https://github.com/octocat/Hello-World/pull/1", expected: "1" },
        {
          url: "https://github.com/microsoft/vscode/pull/200000",
          expected: "200000",
        },
        {
          url: "https://github.com/facebook/react/pull/25000",
          expected: "25000",
        },
      ];

      for (const { url, expected } of prNumbers) {
        const result = GitHubUrlParser.parse(url);
        expect(result?.prNumber).toBe(expected);
      }
    });
  });

  describe("Issue URL parsing", () => {
    it("should parse real issue URLs correctly", () => {
      for (const url of REAL_GITHUB_URLS.ISSUES) {
        const result = GitHubUrlParser.parse(url);

        expect(result).toBeDefined();
        expect(result?.type).toBe("issue");
        expect(result?.owner).toBeTruthy();
        expect(result?.repo).toBeTruthy();
        expect(result?.issueNumber).toBeTruthy();
        expect(result?.branch).toBeUndefined();
        expect(result?.prNumber).toBeUndefined();

        console.log(
          `✓ Parsed issue: ${result?.owner}/${result?.repo}#${result?.issueNumber}`
        );
      }
    });
  });

  describe("getPullRequestInfo() method with real URLs", () => {
    it("should extract PR info from real GitHub PR URLs", () => {
      const testCases = [
        {
          url: "https://github.com/octocat/Hello-World/pull/1",
          expected: { owner: "octocat", repo: "Hello-World", prNumber: 1 },
        },
        {
          url: "https://github.com/microsoft/vscode/pull/200000",
          expected: { owner: "microsoft", repo: "vscode", prNumber: 200000 },
        },
        {
          url: "https://github.com/facebook/react/pull/25000/files",
          expected: { owner: "facebook", repo: "react", prNumber: 25000 },
        },
      ];

      for (const { url, expected } of testCases) {
        const info = GitHubUrlParser.getPullRequestInfo(url);
        expect(info).toBeDefined();
        expect(info?.owner).toBe(expected.owner);
        expect(info?.repo).toBe(expected.repo);
        expect(info?.prNumber).toBe(expected.prNumber);
      }
    });

    it("should return null for non-PR URLs", () => {
      const nonPrUrls = [
        ...REAL_GITHUB_URLS.REPOSITORIES,
        ...REAL_GITHUB_URLS.BRANCHES,
        ...REAL_GITHUB_URLS.ISSUES,
        "https://github.com/owner/repo/pull/123/commits", // Not supported
      ];

      for (const url of nonPrUrls) {
        const info = GitHubUrlParser.getPullRequestInfo(url);
        expect(info).toBeNull();
      }
    });
  });

  describe("URL validation with real patterns", () => {
    it("should correctly identify valid GitHub URLs", () => {
      const allValidUrls = [
        ...REAL_GITHUB_URLS.REPOSITORIES,
        ...REAL_GITHUB_URLS.BRANCHES,
        ...REAL_GITHUB_URLS.PULL_REQUESTS,
        ...REAL_GITHUB_URLS.PR_FILES,
        ...REAL_GITHUB_URLS.ISSUES,
      ];

      for (const url of allValidUrls) {
        expect(GitHubUrlParser.isValidGitHubUrl(url)).toBe(true);
        console.log(`✓ Valid: ${url}`);
      }
    });

    it("should correctly reject invalid URLs", () => {
      for (const url of REAL_GITHUB_URLS.INVALID_URLS) {
        expect(GitHubUrlParser.isValidGitHubUrl(url)).toBe(false);
        console.log(`✓ Invalid (correctly rejected): ${url}`);
      }
    });
  });

  describe("API endpoint generation", () => {
    it("should generate correct API endpoints for real URLs", () => {
      const testCases = [
        {
          url: "https://github.com/octocat/Hello-World",
          expected: "repos/octocat/Hello-World",
        },
        {
          url: "https://github.com/microsoft/vscode/tree/main",
          expected: "repos/microsoft/vscode/branches/main",
        },
        {
          url: "https://github.com/facebook/react/pull/25000",
          expected: "repos/facebook/react/pulls/25000",
        },
        {
          url: "https://github.com/github/gitignore/issues/1000",
          expected: "repos/github/gitignore/issues/1000",
        },
      ];

      for (const { url, expected } of testCases) {
        const endpoint = GitHubUrlParser.getApiEndpoint(url);
        expect(endpoint).toBe(expected);
      }
    });

    it("should return null for invalid URLs", () => {
      for (const url of REAL_GITHUB_URLS.INVALID_URLS) {
        const endpoint = GitHubUrlParser.getApiEndpoint(url);
        expect(endpoint).toBeNull();
      }
    });
  });

  describe("Repository info extraction", () => {
    it("should extract repository info from all valid GitHub URLs", () => {
      const allValidUrls = [
        ...REAL_GITHUB_URLS.REPOSITORIES,
        ...REAL_GITHUB_URLS.BRANCHES,
        ...REAL_GITHUB_URLS.PULL_REQUESTS,
        ...REAL_GITHUB_URLS.ISSUES,
      ];

      for (const url of allValidUrls) {
        const info = GitHubUrlParser.getRepositoryInfo(url);
        expect(info).toBeDefined();
        expect(info?.owner).toBeTruthy();
        expect(info?.repo).toBeTruthy();
      }
    });

    it("should return null for invalid URLs", () => {
      for (const url of REAL_GITHUB_URLS.INVALID_URLS) {
        const info = GitHubUrlParser.getRepositoryInfo(url);
        expect(info).toBeNull();
      }
    });
  });

  describe("Edge cases and real-world patterns", () => {
    it("should handle URLs with query parameters", () => {
      const urlsWithParams = [
        "https://github.com/microsoft/vscode/pull/200000?tab=files",
        "https://github.com/facebook/react/pull/25000?diff=unified",
        "https://github.com/octocat/Hello-World/pull/1#discussion_r123456",
      ];

      for (const url of urlsWithParams) {
        const result = GitHubUrlParser.parse(url);
        expect(result).toBeDefined();
        expect(result?.type).toBe("pull_request");
      }
    });

    it("should handle URLs with fragments", () => {
      const urlsWithFragments = [
        "https://github.com/microsoft/vscode/pull/200000#issuecomment-123456",
        "https://github.com/facebook/react/issues/25000#event-123456",
      ];

      for (const url of urlsWithFragments) {
        const result = GitHubUrlParser.parse(url);
        expect(result).toBeDefined();
      }
    });

    it("should handle case sensitivity correctly", () => {
      // GitHub URLs are case-sensitive for owner/repo names
      const caseSensitiveUrls = [
        "https://github.com/Microsoft/vscode", // Capital M
        "https://github.com/FaceBook/react", // Capital B
      ];

      for (const url of caseSensitiveUrls) {
        const result = GitHubUrlParser.parse(url);
        expect(result).toBeDefined();
        // Should preserve original casing
        expect(result?.owner).toMatch(/[A-Z]/);
      }
    });
  });
});
