// Using vitest globals - see vitest.config.ts globals: true
import { GitHubUrlParser } from "../../../../src/services/gemini/GitHubUrlParser.js";

describe("GitHubUrlParser", () => {
  describe("parse()", () => {
    it("should parse repository URLs correctly", () => {
      const url = "https://github.com/bsmi021/mcp-gemini-server";
      const result = GitHubUrlParser.parse(url);

      expect(result?.type).toBe("repository");
      expect(result?.owner).toBe("bsmi021");
      expect(result?.repo).toBe("mcp-gemini-server");
      expect(result?.branch).toBeUndefined();
      expect(result?.prNumber).toBeUndefined();
      expect(result?.issueNumber).toBeUndefined();
    });

    it("should parse branch URLs correctly", () => {
      const url =
        "https://github.com/bsmi021/mcp-gemini-server/tree/feature/add-reasoning-effort-option";
      const result = GitHubUrlParser.parse(url);

      expect(result?.type).toBe("branch");
      expect(result?.owner).toBe("bsmi021");
      expect(result?.repo).toBe("mcp-gemini-server");
      expect(result?.branch).toBe("feature/add-reasoning-effort-option");
      expect(result?.prNumber).toBeUndefined();
      expect(result?.issueNumber).toBeUndefined();
    });

    it("should parse pull request URLs correctly", () => {
      const url = "https://github.com/bsmi021/mcp-gemini-server/pull/2";
      const result = GitHubUrlParser.parse(url);

      expect(result?.type).toBe("pull_request");
      expect(result?.owner).toBe("bsmi021");
      expect(result?.repo).toBe("mcp-gemini-server");
      expect(result?.branch).toBeUndefined();
      expect(result?.prNumber).toBe("2");
      expect(result?.issueNumber).toBeUndefined();
    });

    it("should parse pull request files URLs correctly", () => {
      const url = "https://github.com/bsmi021/mcp-gemini-server/pull/2/files";
      const result = GitHubUrlParser.parse(url);

      expect(result?.type).toBe("pr_files");
      expect(result?.owner).toBe("bsmi021");
      expect(result?.repo).toBe("mcp-gemini-server");
      expect(result?.branch).toBeUndefined();
      expect(result?.prNumber).toBe("2");
      expect(result?.filesView).toBe(true);
      expect(result?.issueNumber).toBeUndefined();
    });

    it("should parse issue URLs correctly", () => {
      const url = "https://github.com/bsmi021/mcp-gemini-server/issues/5";
      const result = GitHubUrlParser.parse(url);

      expect(result?.type).toBe("issue");
      expect(result?.owner).toBe("bsmi021");
      expect(result?.repo).toBe("mcp-gemini-server");
      expect(result?.branch).toBeUndefined();
      expect(result?.prNumber).toBeUndefined();
      expect(result?.issueNumber).toBe("5");
    });

    it("should return null for invalid URLs", () => {
      const urls = [
        "https://example.com",
        "https://github.com",
        "https://github.com/bsmi021",
        "https://github.com/bsmi021/mcp-gemini-server/unknown",
        "not a url at all",
      ];

      for (const url of urls) {
        expect(GitHubUrlParser.parse(url)).toBeNull();
      }
    });
  });

  describe("isValidGitHubUrl()", () => {
    it("should return true for valid GitHub URLs", () => {
      const urls = [
        "https://github.com/bsmi021/mcp-gemini-server",
        "https://github.com/bsmi021/mcp-gemini-server/tree/main",
        "https://github.com/bsmi021/mcp-gemini-server/pull/2",
        "https://github.com/bsmi021/mcp-gemini-server/pull/2/files",
        "https://github.com/bsmi021/mcp-gemini-server/issues/5",
      ];

      for (const url of urls) {
        expect(GitHubUrlParser.isValidGitHubUrl(url)).toBe(true);
      }
    });

    it("should return false for invalid URLs", () => {
      const urls = [
        "https://example.com",
        "https://github.com",
        "https://github.com/bsmi021",
        "https://github.com/bsmi021/mcp-gemini-server/unknown",
        "not a url at all",
      ];

      for (const url of urls) {
        expect(GitHubUrlParser.isValidGitHubUrl(url)).toBe(false);
      }
    });
  });

  describe("getApiEndpoint()", () => {
    it("should return the correct API endpoint for repository URLs", () => {
      const url = "https://github.com/bsmi021/mcp-gemini-server";
      expect(GitHubUrlParser.getApiEndpoint(url)).toBe(
        "repos/bsmi021/mcp-gemini-server"
      );
    });

    it("should return the correct API endpoint for branch URLs", () => {
      const url = "https://github.com/bsmi021/mcp-gemini-server/tree/main";
      expect(GitHubUrlParser.getApiEndpoint(url)).toBe(
        "repos/bsmi021/mcp-gemini-server/branches/main"
      );
    });

    it("should return the correct API endpoint for PR URLs", () => {
      const url = "https://github.com/bsmi021/mcp-gemini-server/pull/2";
      expect(GitHubUrlParser.getApiEndpoint(url)).toBe(
        "repos/bsmi021/mcp-gemini-server/pulls/2"
      );
    });

    it("should return the correct API endpoint for PR files URLs", () => {
      const url = "https://github.com/bsmi021/mcp-gemini-server/pull/2/files";
      expect(GitHubUrlParser.getApiEndpoint(url)).toBe(
        "repos/bsmi021/mcp-gemini-server/pulls/2"
      );
    });

    it("should return the correct API endpoint for issue URLs", () => {
      const url = "https://github.com/bsmi021/mcp-gemini-server/issues/5";
      expect(GitHubUrlParser.getApiEndpoint(url)).toBe(
        "repos/bsmi021/mcp-gemini-server/issues/5"
      );
    });

    it("should return null for invalid URLs", () => {
      const url = "https://example.com";
      expect(GitHubUrlParser.getApiEndpoint(url)).toBeNull();
    });
  });

  describe("getRepositoryInfo()", () => {
    it("should return repository info for valid GitHub URLs", () => {
      const urls = [
        "https://github.com/bsmi021/mcp-gemini-server",
        "https://github.com/bsmi021/mcp-gemini-server/tree/main",
        "https://github.com/bsmi021/mcp-gemini-server/pull/2",
        "https://github.com/bsmi021/mcp-gemini-server/issues/5",
      ];

      for (const url of urls) {
        const info = GitHubUrlParser.getRepositoryInfo(url);
        expect(info?.owner).toBe("bsmi021");
        expect(info?.repo).toBe("mcp-gemini-server");
      }
    });

    it("should return null for invalid URLs", () => {
      const url = "https://example.com";
      expect(GitHubUrlParser.getRepositoryInfo(url)).toBeNull();
    });
  });

  describe("getPullRequestInfo()", () => {
    it("should have the getPullRequestInfo method", () => {
      expect(typeof GitHubUrlParser.getPullRequestInfo).toBe("function");
    });

    it("should extract PR info from basic PR URL", () => {
      const url = "https://github.com/owner/repo/pull/123";
      const info = GitHubUrlParser.getPullRequestInfo(url);
      expect(info?.owner).toBe("owner");
      expect(info?.repo).toBe("repo");
      expect(info?.prNumber).toBe(123);
    });

    it("should extract PR info from PR files URL", () => {
      const url = "https://github.com/owner/repo/pull/123/files";
      const info = GitHubUrlParser.getPullRequestInfo(url);
      expect(info?.owner).toBe("owner");
      expect(info?.repo).toBe("repo");
      expect(info?.prNumber).toBe(123);
    });

    it("should handle different PR number formats", () => {
      const testCases = [
        { url: "https://github.com/test/repo/pull/1", prNumber: 1 },
        { url: "https://github.com/test/repo/pull/999", prNumber: 999 },
        { url: "https://github.com/test/repo/pull/12345", prNumber: 12345 },
      ];

      for (const { url, prNumber } of testCases) {
        const info = GitHubUrlParser.getPullRequestInfo(url);
        expect(info?.prNumber).toBe(prNumber);
      }
    });

    it("should return null for non-PR URLs", () => {
      const urls = [
        "https://github.com/owner/repo",
        "https://github.com/owner/repo/tree/main",
        "https://github.com/owner/repo/issues/123",
        "https://github.com/owner/repo/pull/123/commits", // Not supported
        "https://example.com",
        "not a url",
      ];

      for (const url of urls) {
        expect(GitHubUrlParser.getPullRequestInfo(url)).toBeNull();
      }
    });

    it("should return null for invalid PR numbers", () => {
      const urls = [
        "https://github.com/owner/repo/pull/0",
        "https://github.com/owner/repo/pull/-1",
        "https://github.com/owner/repo/pull/abc",
        "https://github.com/owner/repo/pull/",
      ];

      for (const url of urls) {
        expect(GitHubUrlParser.getPullRequestInfo(url)).toBeNull();
      }
    });
  });
});
