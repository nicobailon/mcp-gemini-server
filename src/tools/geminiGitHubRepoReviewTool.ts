import { Request, Response } from "express";
import { Tool } from "@modelcontextprotocol/sdk";
import { logger } from "../utils/logger.js";
import { GeminiGitHubRepoReviewParamsSchema } from "./geminiGitHubRepoReviewParams.js";
import { GeminiService } from "../services/GeminiService.js";
import { GitHubUrlParser } from "../services/gemini/GitHubUrlParser.js";

/**
 * Tool for analyzing GitHub repositories using Gemini models
 *
 * @param req The HTTP request
 * @param res The HTTP response
 * @param services Available services including Gemini service
 * @returns Promise resolving when the operation is complete
 */
export const geminiGitHubRepoReviewTool: Tool = async (
  req: Request,
  res: Response,
  services: Record<string, unknown>
): Promise<void> => {
  // Type cast services to access geminiService
  const typedServices = services as { geminiService: GeminiService };
  const start = Date.now();
  logger.info("[geminiGitHubRepoReviewTool] Processing request");

  try {
    // Parse and validate request parameters
    const validatedParams = GeminiGitHubRepoReviewParamsSchema.parse(req.query);

    // Extract parameters
    const {
      repoUrl,
      model,
      reasoningEffort,
      reviewFocus,
      branch,
      maxFiles,
      excludePatterns,
      prioritizeFiles,
      customPrompt,
    } = validatedParams;

    // Parse GitHub URL
    const parsedUrl = GitHubUrlParser.parse(repoUrl);
    if (!parsedUrl) {
      res.status(400).json({
        error: "Invalid GitHub URL",
        message: "The provided URL is not a valid GitHub repository URL",
      });
      return;
    }

    // Extract branch from URL if present and not provided as a separate parameter
    const effectiveBranch =
      branch || (parsedUrl.type === "branch" ? parsedUrl.branch : undefined);

    // Extract owner and repo from the parsed URL
    const { owner, repo } = parsedUrl;

    // Call the GitHub Repository Review service
    const reviewText = await typedServices.geminiService.reviewGitHubRepository(
      {
        owner,
        repo,
        branch: effectiveBranch,
        modelName: model,
        reasoningEffort,
        reviewFocus,
        maxFilesToInclude: maxFiles,
        excludePatterns,
        prioritizeFiles,
        customPrompt,
      }
    );

    // Send the review result as JSON response
    res.json({
      review: reviewText,
      repositoryUrl: repoUrl,
      model: model || "default",
      branch: effectiveBranch,
      executionTime: Date.now() - start,
    });
  } catch (error: unknown) {
    // Log error details
    logger.error("[geminiGitHubRepoReviewTool] Error", { error });

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

export default geminiGitHubRepoReviewTool;
