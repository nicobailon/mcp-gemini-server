// Using vitest globals - see vitest.config.ts globals: true

import {
  geminiGithubPrReviewParamsSchema,
  type GeminiGithubPrReviewParams,
} from "../../src/tools/geminiGithubPrReviewParams.js";

/**
 * Real GitHub PR URLs for comprehensive parameter validation testing
 */
const REAL_TEST_DATA = {
  VALID_PR_URLS: [
    "https://github.com/octocat/Hello-World/pull/1",
    "https://github.com/microsoft/vscode/pull/200000",
    "https://github.com/facebook/react/pull/25000",
    "https://github.com/github/gitignore/pull/4000",
    "https://github.com/octocat/Hello-World/pull/1/files",
    "https://github.com/microsoft/vscode/pull/200000/files",
  ],

  INVALID_PR_URLS: [
    "https://example.com/owner/repo/pull/123", // Wrong domain
    "https://github.com/owner/repo", // Not a PR URL
    "https://github.com/owner/repo/issues/123", // Issue, not PR
    "https://github.com/owner/repo/pull/abc", // Non-numeric PR number
    "https://github.com/owner/repo/pull/0", // Zero PR number (edge case)
    "https://github.com/owner/repo/pull/-1", // Negative PR number
    "https://github.com/owner/repo/pull/123/commits", // Unsupported PR sub-page
    "https://gitlab.com/owner/repo/merge_requests/123", // Wrong platform
    "not a url",
    "",
    "ftp://github.com/owner/repo/pull/123", // Wrong protocol
  ],

  VALID_FOCUS_AREAS: ["general", "security", "performance"] as const,

  INVALID_FOCUS_AREAS: ["invalid", "test", "code", "quality", ""],

  VALID_MAX_FILES: [1, 5, 10, 25, 50, 75, 100],

  INVALID_MAX_FILES: [0, -1, -10, 101, 200, 1000, "10", 1.5, null, undefined],
};

describe("GitHub PR Review Parameters - Real Data Validation", () => {
  describe("pull_request_url validation with real URLs", () => {
    it("should accept all valid real GitHub PR URLs", () => {
      for (const url of REAL_TEST_DATA.VALID_PR_URLS) {
        const params = { pull_request_url: url };
        const result = geminiGithubPrReviewParamsSchema.safeParse(params);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.pull_request_url).toBe(url);
        } else {
          console.error(
            `Failed to validate valid URL: ${url}`,
            result.error.errors
          );
        }
      }
    });

    it("should reject all invalid URLs with proper error messages", () => {
      for (const url of REAL_TEST_DATA.INVALID_PR_URLS) {
        const params = { pull_request_url: url };
        const result = geminiGithubPrReviewParamsSchema.safeParse(params);

        expect(result.success).toBe(false);
        if (!result.success) {
          const errorMessages = result.error.errors.map((e) => e.message);
          expect(
            errorMessages.some(
              (msg) =>
                msg.includes("GitHub") ||
                msg.includes("URL") ||
                msg.includes("pull request")
            )
          ).toBe(true);
        }
      }
    });

    it("should require pull_request_url field", () => {
      const params = {};
      const result = geminiGithubPrReviewParamsSchema.safeParse(params);
      expect(result.success).toBe(false);

      if (!result.success) {
        const errorMessages = result.error.errors.map((e) => e.message);
        expect(
          errorMessages.some(
            (msg) =>
              msg.includes("required") || msg.includes("Pull request URL")
          )
        ).toBe(true);
      }
    });

    it("should handle edge cases in URL format", () => {
      const edgeCases = [
        // Valid edge cases
        { url: "https://github.com/a/b/pull/1", shouldPass: true },
        {
          url: "https://github.com/very-long-owner-name/very-long-repo-name/pull/999999",
          shouldPass: true,
        },

        // Invalid edge cases
        { url: "https://github.com//repo/pull/123", shouldPass: false }, // Empty owner
        { url: "https://github.com/owner//pull/123", shouldPass: false }, // Empty repo
        { url: "https://github.com/owner/repo/pull/", shouldPass: false }, // Empty PR number
      ];

      for (const { url, shouldPass } of edgeCases) {
        const params = { pull_request_url: url };
        const result = geminiGithubPrReviewParamsSchema.safeParse(params);

        if (shouldPass) {
          expect(result.success).toBe(true);
        } else {
          expect(result.success).toBe(false);
        }
      }
    });
  });

  describe("focus_area validation", () => {
    it("should accept all valid focus areas", () => {
      for (const focus_area of REAL_TEST_DATA.VALID_FOCUS_AREAS) {
        const params = {
          pull_request_url: REAL_TEST_DATA.VALID_PR_URLS[0],
          focus_area,
        };
        const result = geminiGithubPrReviewParamsSchema.safeParse(params);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.focus_area).toBe(focus_area);
        }
      }
    });

    it("should reject invalid focus areas", () => {
      for (const focus_area of REAL_TEST_DATA.INVALID_FOCUS_AREAS) {
        const params = {
          pull_request_url: REAL_TEST_DATA.VALID_PR_URLS[0],
          focus_area,
        };
        const result = geminiGithubPrReviewParamsSchema.safeParse(params);

        expect(result.success).toBe(false);
        if (!result.success) {
          const errorMessages = result.error.errors.map((e) => e.message);
          expect(
            errorMessages.some(
              (msg) =>
                msg.includes("enum") ||
                msg.includes("general") ||
                msg.includes("security") ||
                msg.includes("performance")
            )
          ).toBe(true);
        }
      }
    });

    it("should be optional with undefined when not provided", () => {
      const params = {
        pull_request_url: REAL_TEST_DATA.VALID_PR_URLS[0],
      };
      const result = geminiGithubPrReviewParamsSchema.safeParse(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.focus_area).toBeUndefined();
      }
    });
  });

  describe("max_files validation", () => {
    it("should accept all valid max_files values", () => {
      for (const max_files of REAL_TEST_DATA.VALID_MAX_FILES) {
        const params = {
          pull_request_url: REAL_TEST_DATA.VALID_PR_URLS[0],
          max_files,
        };
        const result = geminiGithubPrReviewParamsSchema.safeParse(params);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.max_files).toBe(max_files);
        }
      }
    });

    it("should reject invalid max_files values", () => {
      for (const max_files of REAL_TEST_DATA.INVALID_MAX_FILES) {
        const params = {
          pull_request_url: REAL_TEST_DATA.VALID_PR_URLS[0],
          max_files,
        };
        const result = geminiGithubPrReviewParamsSchema.safeParse(params);

        expect(result.success).toBe(false);
        if (!result.success) {
          const errorMessages = result.error.errors.map((e) => e.message);
          expect(
            errorMessages.some(
              (msg) =>
                msg.includes("number") ||
                msg.includes("integer") ||
                msg.includes("max") ||
                msg.includes("min")
            )
          ).toBe(true);
        }
      }
    });

    it("should be optional with undefined when not provided", () => {
      const params = {
        pull_request_url: REAL_TEST_DATA.VALID_PR_URLS[0],
      };
      const result = geminiGithubPrReviewParamsSchema.safeParse(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.max_files).toBeUndefined();
      }
    });

    it("should enforce boundary values correctly", () => {
      const boundaryTests = [
        { value: 1, shouldPass: true }, // Minimum valid
        { value: 100, shouldPass: true }, // Maximum valid
        { value: 0, shouldPass: false }, // Below minimum
        { value: 101, shouldPass: false }, // Above maximum
      ];

      for (const { value, shouldPass } of boundaryTests) {
        const params = {
          pull_request_url: REAL_TEST_DATA.VALID_PR_URLS[0],
          max_files: value,
        };
        const result = geminiGithubPrReviewParamsSchema.safeParse(params);

        if (shouldPass) {
          expect(result.success).toBe(true);
        } else {
          expect(result.success).toBe(false);
        }
      }
    });
  });

  describe("Complete parameter combinations", () => {
    it("should validate realistic parameter combinations", () => {
      const validCombinations: GeminiGithubPrReviewParams[] = [
        {
          pull_request_url: "https://github.com/octocat/Hello-World/pull/1",
        },
        {
          pull_request_url: "https://github.com/microsoft/vscode/pull/200000",
          focus_area: "general",
        },
        {
          pull_request_url: "https://github.com/facebook/react/pull/25000",
          max_files: 50,
        },
        {
          pull_request_url: "https://github.com/github/gitignore/pull/4000",
          focus_area: "security",
          max_files: 25,
        },
        {
          pull_request_url:
            "https://github.com/octocat/Hello-World/pull/1/files",
          focus_area: "performance",
          max_files: 100,
        },
      ];

      for (const params of validCombinations) {
        const result = geminiGithubPrReviewParamsSchema.safeParse(params);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.pull_request_url).toBe(params.pull_request_url);
          if (params.focus_area) {
            expect(result.data.focus_area).toBe(params.focus_area);
          }
          if (params.max_files) {
            expect(result.data.max_files).toBe(params.max_files);
          }
        }
      }
    });

    it("should provide comprehensive error messages for multiple validation failures", () => {
      const invalidParams = {
        pull_request_url: "https://example.com/invalid",
        focus_area: "invalid",
        max_files: 0,
      };

      const result = geminiGithubPrReviewParamsSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);

      if (!result.success) {
        const errors = result.error.errors;
        expect(errors.length).toBeGreaterThan(0);

        // Should have errors for multiple fields
        const fieldPaths = errors.map((e) => e.path.join("."));
        expect(fieldPaths).toContain("pull_request_url");
        expect(fieldPaths).toContain("focus_area");
        expect(fieldPaths).toContain("max_files");

        // Check that we get meaningful error messages
        const errorMessages = errors.map((e) => e.message);
        expect(errorMessages.some((msg) => msg.includes("GitHub"))).toBe(true);
      }
    });

    it("should handle type coercion correctly", () => {
      // Test what happens with type coercion attempts
      const coercionTests = [
        {
          params: {
            pull_request_url: "https://github.com/octocat/Hello-World/pull/1",
            max_files: "25", // String instead of number
          },
          shouldPass: false,
        },
        {
          params: {
            pull_request_url: "https://github.com/octocat/Hello-World/pull/1",
            focus_area: "GENERAL", // Wrong case
          },
          shouldPass: false,
        },
      ];

      for (const { params, shouldPass } of coercionTests) {
        const result = geminiGithubPrReviewParamsSchema.safeParse(params);

        if (shouldPass) {
          expect(result.success).toBe(true);
        } else {
          expect(result.success).toBe(false);
        }
      }
    });
  });

  describe("Real-world usage scenarios", () => {
    it("should validate parameters for small PRs", () => {
      const smallPrParams = {
        pull_request_url: "https://github.com/octocat/Hello-World/pull/1",
        focus_area: "general" as const,
        max_files: 5,
      };

      const result = geminiGithubPrReviewParamsSchema.safeParse(smallPrParams);
      expect(result.success).toBe(true);
    });

    it("should validate parameters for large PRs with focus", () => {
      const largePrParams = {
        pull_request_url: "https://github.com/microsoft/vscode/pull/200000",
        focus_area: "security" as const,
        max_files: 100,
      };

      const result = geminiGithubPrReviewParamsSchema.safeParse(largePrParams);
      expect(result.success).toBe(true);
    });

    it("should validate minimal parameters", () => {
      const minimalParams = {
        pull_request_url: "https://github.com/facebook/react/pull/25000",
      };

      const result = geminiGithubPrReviewParamsSchema.safeParse(minimalParams);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.focus_area).toBeUndefined();
        expect(result.data.max_files).toBeUndefined();
      }
    });

    it("should maintain type safety throughout validation", () => {
      const validParams = {
        pull_request_url: "https://github.com/github/gitignore/pull/4000",
        focus_area: "performance" as const,
        max_files: 50,
      };

      const result = geminiGithubPrReviewParamsSchema.safeParse(validParams);
      expect(result.success).toBe(true);

      if (result.success) {
        // TypeScript should enforce these types
        const data: GeminiGithubPrReviewParams = result.data;
        expect(typeof data.pull_request_url).toBe("string");
        if (data.focus_area) {
          expect(["general", "security", "performance"]).toContain(
            data.focus_area
          );
        }
        if (data.max_files) {
          expect(typeof data.max_files).toBe("number");
          expect(Number.isInteger(data.max_files)).toBe(true);
        }
      }
    });
  });
});
