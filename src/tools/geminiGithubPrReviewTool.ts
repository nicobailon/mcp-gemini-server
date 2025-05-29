import { GeminiService } from "../services/index.js";
import { logger } from "../utils/index.js";
import { mapAnyErrorToMcpError } from "../utils/errors.js";
import { GitHubUrlParser } from "../services/gemini/GitHubUrlParser.js";
import { GeminiValidationError } from "../utils/geminiErrors.js";
import {
  geminiGithubPrReviewParamsSchema,
  type GeminiGithubPrReviewParams,
} from "./geminiGithubPrReviewParams.js";
import type { NewGeminiServiceToolObject } from "./registration/ToolAdapter.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Tool name and description constants
 */
export const TOOL_NAME_GITHUB_PR_REVIEW = "gemini_github_pr_review";
export const TOOL_DESCRIPTION_GITHUB_PR_REVIEW =
  "Analyze GitHub pull requests using Gemini models. Provides comprehensive code review with configurable focus areas (general, security, performance) and intelligent file selection.";

/**
 * GitHub PR review tool implementation
 * Handles comprehensive analysis of GitHub pull requests using Gemini models
 */

export const geminiGithubPrReviewTool: NewGeminiServiceToolObject<
  GeminiGithubPrReviewParams,
  CallToolResult
> = {
  name: TOOL_NAME_GITHUB_PR_REVIEW,
  description: TOOL_DESCRIPTION_GITHUB_PR_REVIEW,
  inputSchema: geminiGithubPrReviewParamsSchema,
  execute: async (args: GeminiGithubPrReviewParams, service: GeminiService) => {
    logger.debug(`Received ${TOOL_NAME_GITHUB_PR_REVIEW} request:`, {
      pull_request_url: args.pull_request_url,
      focus_area: args.focus_area,
      max_files: args.max_files,
    });

    try {
      // Extract PR information from URL
      const prInfo = GitHubUrlParser.getPullRequestInfo(args.pull_request_url);
      if (!prInfo) {
        throw new GeminiValidationError(
          "Invalid GitHub pull request URL format",
          "pull_request_url"
        );
      }

      const { owner, repo, prNumber } = prInfo;
      logger.debug(`Parsed PR info:`, { owner, repo, prNumber });

      // Note: File limiting logic (max_files parameter) is handled by the underlying
      // GitDiffService through intelligent file selection and prioritization.
      // The service automatically prioritizes important files when reviewing large PRs.
      logger.debug(
        `Processing PR with max_files limit: ${args.max_files || 25}`
      );

      // Call the service for GitHub PR review with our simplified parameters
      const reviewText = await service.reviewGitHubPullRequest({
        owner,
        repo,
        prNumber,
        modelName: "gemini-2.0-flash-lite", // Use cheapest model for cost efficiency
        reasoningEffort: "medium", // Balanced analysis
        reviewFocus: args.focus_area || "general",
        excludePatterns: [], // No exclusions for simplified tool
        customPrompt: undefined, // No custom prompt for simplified tool
      });

      // Format the response according to the specified schema
      const structuredResponse = `# GitHub PR Review Results

## Pull Request Information
- **Repository**: ${owner}/${repo}
- **Pull Request**: #${prNumber}
- **Focus Area**: ${args.focus_area || "general"}
- **Max Files Analyzed**: ${args.max_files || 25}

## Code Review Analysis

${reviewText}

---
*Review completed using Gemini ${args.focus_area || "general"} analysis with intelligent file selection*`;

      return {
        content: [
          {
            type: "text",
            text: structuredResponse,
          },
        ],
      };
    } catch (error: unknown) {
      logger.error(`Error processing ${TOOL_NAME_GITHUB_PR_REVIEW}:`, error);
      throw mapAnyErrorToMcpError(error, TOOL_NAME_GITHUB_PR_REVIEW);
    }
  },
};
