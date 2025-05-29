import { z } from "zod";

/**
 * Validation schema for GitHub pull request URL
 * Supports various GitHub PR URL formats
 */
const pullRequestUrlSchema = z
  .string()
  .min(1, "Pull request URL is required")
  .url("Must be a valid URL")
  .refine(
    (url) => {
      // Check if it's a GitHub domain
      const githubPattern = /^https?:\/\/github\.com\//;
      if (!githubPattern.test(url)) {
        return false;
      }

      // Check if it's a pull request URL
      const prPattern =
        /^https?:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+(?:\/.*)?$/;
      return prPattern.test(url);
    },
    {
      message:
        "Must be a valid GitHub pull request URL (e.g., https://github.com/owner/repo/pull/123)",
    }
  );

/**
 * Validation schema for focus area parameter
 * Determines the type of review analysis to perform
 */
const focusAreaSchema = z
  .enum(["general", "security", "performance"])
  .default("general")
  .describe("Focus area for the code review analysis");

/**
 * Validation schema for maximum files parameter
 * Limits the number of files to analyze for performance
 */
const maxFilesSchema = z
  .number()
  .int("Max files must be an integer")
  .min(1, "Max files must be at least 1")
  .max(100, "Max files cannot exceed 100")
  .default(25)
  .describe("Maximum number of files to analyze in the pull request");

/**
 * Complete parameter schema for GitHub PR review tool
 */
export const geminiGithubPrReviewParamsSchema = z.object({
  pull_request_url: pullRequestUrlSchema,
  focus_area: focusAreaSchema.optional(),
  max_files: maxFilesSchema.optional(),
});

/**
 * Type definition for GitHub PR review parameters
 */
export type GeminiGithubPrReviewParams = z.infer<
  typeof geminiGithubPrReviewParamsSchema
>;

/**
 * Default values for optional parameters
 */
export const defaultGithubPrReviewParams: Partial<GeminiGithubPrReviewParams> =
  {
    focus_area: "general",
    max_files: 25,
  };
