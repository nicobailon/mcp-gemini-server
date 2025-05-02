import { describe, it } from "node:test";
import assert from "node:assert";
import { GitHubUrlParser } from "../../../../src/services/gemini/GitHubUrlParser.js";

describe("GitHubUrlParser", () => {
  describe("parse()", () => {
    it("should parse repository URLs correctly", () => {
      const url = "https://github.com/nicobailon/mcp-gemini-server";
      const result = GitHubUrlParser.parse(url);

      assert.strictEqual(result?.type, "repository");
      assert.strictEqual(result?.owner, "nicobailon");
      assert.strictEqual(result?.repo, "mcp-gemini-server");
      assert.strictEqual(result?.branch, undefined);
      assert.strictEqual(result?.prNumber, undefined);
      assert.strictEqual(result?.issueNumber, undefined);
    });

    it("should parse branch URLs correctly", () => {
      const url =
        "https://github.com/nicobailon/mcp-gemini-server/tree/feature/add-reasoning-effort-option";
      const result = GitHubUrlParser.parse(url);

      assert.strictEqual(result?.type, "branch");
      assert.strictEqual(result?.owner, "nicobailon");
      assert.strictEqual(result?.repo, "mcp-gemini-server");
      assert.strictEqual(result?.branch, "feature/add-reasoning-effort-option");
      assert.strictEqual(result?.prNumber, undefined);
      assert.strictEqual(result?.issueNumber, undefined);
    });

    it("should parse pull request URLs correctly", () => {
      const url = "https://github.com/nicobailon/mcp-gemini-server/pull/2";
      const result = GitHubUrlParser.parse(url);

      assert.strictEqual(result?.type, "pull_request");
      assert.strictEqual(result?.owner, "nicobailon");
      assert.strictEqual(result?.repo, "mcp-gemini-server");
      assert.strictEqual(result?.branch, undefined);
      assert.strictEqual(result?.prNumber, "2");
      assert.strictEqual(result?.issueNumber, undefined);
    });

    it("should parse pull request files URLs correctly", () => {
      const url =
        "https://github.com/nicobailon/mcp-gemini-server/pull/2/files";
      const result = GitHubUrlParser.parse(url);

      assert.strictEqual(result?.type, "pr_files");
      assert.strictEqual(result?.owner, "nicobailon");
      assert.strictEqual(result?.repo, "mcp-gemini-server");
      assert.strictEqual(result?.branch, undefined);
      assert.strictEqual(result?.prNumber, "2");
      assert.strictEqual(result?.filesView, true);
      assert.strictEqual(result?.issueNumber, undefined);
    });

    it("should parse issue URLs correctly", () => {
      const url = "https://github.com/nicobailon/mcp-gemini-server/issues/5";
      const result = GitHubUrlParser.parse(url);

      assert.strictEqual(result?.type, "issue");
      assert.strictEqual(result?.owner, "nicobailon");
      assert.strictEqual(result?.repo, "mcp-gemini-server");
      assert.strictEqual(result?.branch, undefined);
      assert.strictEqual(result?.prNumber, undefined);
      assert.strictEqual(result?.issueNumber, "5");
    });

    it("should return null for invalid URLs", () => {
      const urls = [
        "https://example.com",
        "https://github.com",
        "https://github.com/nicobailon",
        "https://github.com/nicobailon/mcp-gemini-server/unknown",
        "not a url at all",
      ];

      for (const url of urls) {
        assert.strictEqual(GitHubUrlParser.parse(url), null);
      }
    });
  });

  describe("isValidGitHubUrl()", () => {
    it("should return true for valid GitHub URLs", () => {
      const urls = [
        "https://github.com/nicobailon/mcp-gemini-server",
        "https://github.com/nicobailon/mcp-gemini-server/tree/main",
        "https://github.com/nicobailon/mcp-gemini-server/pull/2",
        "https://github.com/nicobailon/mcp-gemini-server/pull/2/files",
        "https://github.com/nicobailon/mcp-gemini-server/issues/5",
      ];

      for (const url of urls) {
        assert.strictEqual(GitHubUrlParser.isValidGitHubUrl(url), true);
      }
    });

    it("should return false for invalid URLs", () => {
      const urls = [
        "https://example.com",
        "https://github.com",
        "https://github.com/nicobailon",
        "https://github.com/nicobailon/mcp-gemini-server/unknown",
        "not a url at all",
      ];

      for (const url of urls) {
        assert.strictEqual(GitHubUrlParser.isValidGitHubUrl(url), false);
      }
    });
  });

  describe("getApiEndpoint()", () => {
    it("should return the correct API endpoint for repository URLs", () => {
      const url = "https://github.com/nicobailon/mcp-gemini-server";
      assert.strictEqual(
        GitHubUrlParser.getApiEndpoint(url),
        "repos/nicobailon/mcp-gemini-server"
      );
    });

    it("should return the correct API endpoint for branch URLs", () => {
      const url = "https://github.com/nicobailon/mcp-gemini-server/tree/main";
      assert.strictEqual(
        GitHubUrlParser.getApiEndpoint(url),
        "repos/nicobailon/mcp-gemini-server/branches/main"
      );
    });

    it("should return the correct API endpoint for PR URLs", () => {
      const url = "https://github.com/nicobailon/mcp-gemini-server/pull/2";
      assert.strictEqual(
        GitHubUrlParser.getApiEndpoint(url),
        "repos/nicobailon/mcp-gemini-server/pulls/2"
      );
    });

    it("should return the correct API endpoint for PR files URLs", () => {
      const url =
        "https://github.com/nicobailon/mcp-gemini-server/pull/2/files";
      assert.strictEqual(
        GitHubUrlParser.getApiEndpoint(url),
        "repos/nicobailon/mcp-gemini-server/pulls/2"
      );
    });

    it("should return the correct API endpoint for issue URLs", () => {
      const url = "https://github.com/nicobailon/mcp-gemini-server/issues/5";
      assert.strictEqual(
        GitHubUrlParser.getApiEndpoint(url),
        "repos/nicobailon/mcp-gemini-server/issues/5"
      );
    });

    it("should return null for invalid URLs", () => {
      const url = "https://example.com";
      assert.strictEqual(GitHubUrlParser.getApiEndpoint(url), null);
    });
  });

  describe("getRepositoryInfo()", () => {
    it("should return repository info for valid GitHub URLs", () => {
      const urls = [
        "https://github.com/nicobailon/mcp-gemini-server",
        "https://github.com/nicobailon/mcp-gemini-server/tree/main",
        "https://github.com/nicobailon/mcp-gemini-server/pull/2",
        "https://github.com/nicobailon/mcp-gemini-server/issues/5",
      ];

      for (const url of urls) {
        const info = GitHubUrlParser.getRepositoryInfo(url);
        assert.strictEqual(info?.owner, "nicobailon");
        assert.strictEqual(info?.repo, "mcp-gemini-server");
      }
    });

    it("should return null for invalid URLs", () => {
      const url = "https://example.com";
      assert.strictEqual(GitHubUrlParser.getRepositoryInfo(url), null);
    });
  });
});
