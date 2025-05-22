import { Request, Response } from "express";
import { Tool } from "@modelcontextprotocol/sdk";
import { logger } from "../utils/logger.js";
import { GeminiGitHubPRReviewParamsSchema } from "./geminiGitHubPRReviewParams.js";
import { GeminiService } from "../services/GeminiService.js";
import { GitHubUrlParser } from "../services/gemini/GitHubUrlParser.js";

/**
 * Tool for analyzing GitHub pull requests using Gemini models
 *
 * @param req The HTTP request
 * @param res The HTTP response
 * @param services Available services including Gemini service
 * @returns Promise resolving when the operation is complete
 */
export const geminiGitHubPRReviewTool: Tool = async (
  req: Request,
  res: Response,
  services: Record<string, unknown>
): Promise<void> => {
  // Type cast services to access geminiService
  const typedServices = services as { geminiService: GeminiService };
  const start = Date.now();
  logger.info("[geminiGitHubPRReviewTool] Processing request");

  try {
    // Parse and validate request parameters
    const validatedParams = GeminiGitHubPRReviewParamsSchema.parse(req.query);

    // Extract parameters
    const {
      prUrl,
      model,
      reasoningEffort,
      reviewFocus,
      filesOnly,
      excludePatterns,
      customPrompt,
    } = validatedParams;

    // Parse GitHub URL
    const parsedUrl = GitHubUrlParser.parse(prUrl);
    if (
      !parsedUrl ||
      (parsedUrl.type !== "pull_request" && parsedUrl.type !== "pr_files")
    ) {
      res.status(400).json({
        error: "Invalid GitHub URL",
        message: "The provided URL is not a valid GitHub pull request URL",
      });
      return;
    }

    // Extract PR number and determine if filesOnly should be true based on URL type
    const prNumber = parseInt(parsedUrl.prNumber!, 10);
    const effectiveFilesOnly = filesOnly || parsedUrl.type === "pr_files";

    // Extract owner and repo from the parsed URL
    const { owner, repo } = parsedUrl;

    // Call the GitHub PR Review service
    const reviewText =
      await typedServices.geminiService.reviewGitHubPullRequest({
        owner,
        repo,
        prNumber,
        modelName: model,
        reasoningEffort,
        reviewFocus,
        excludePatterns,
        customPrompt,
      });

    // Send the review result as JSON response
    res.json({
      review: reviewText,
      pullRequestUrl: prUrl,
      model: model || "default",
      filesOnly: effectiveFilesOnly,
      executionTime: Date.now() - start,
    });
  } catch (error: unknown) {
    // Log error details
    logger.error("[geminiGitHubPRReviewTool] Error", { error });

    // Send appropriate error response
    if (error instanceof Error) {
      if (error.name === "ZodError" && "errors" in error) {
        res.status(400).json({
          error: "Invalid parameters",
          details: (error as { errors: unknown }).errors,
        });
      } else if (error.name === "GeminiValidationError" && "field" in error) {
        res.status(400).json({
          error: error.message,
          field: (error as { field: string }).field,
        });
      } else if (error.name === "GeminiApiError") {
        res.status(502).json({
          error: "Gemini API error",
          message: error.message,
        });
      } else if (error.message && error.message.includes("GitHub API")) {
        res.status(502).json({
          error: "GitHub API error",
          message: error.message,
        });
      } else {
        res.status(500).json({
          error: "Internal server error",
          message: error.message || "Unknown error",
        });
      }
    } else {
      res.status(500).json({
        error: "Internal server error",
        message: "An unknown error occurred",
      });
    }
  }
};

export default geminiGitHubPRReviewTool;
