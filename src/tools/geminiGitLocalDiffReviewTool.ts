/// <reference path="../types/modelcontextprotocol-sdk.d.ts" />

import { Request, Response } from "express";
import { Tool } from "@modelcontextprotocol/sdk";
import { logger } from "../utils/logger.js";
import { GeminiGitLocalDiffReviewParamsSchema } from "./geminiGitLocalDiffReviewParams.js";
import { GeminiService } from "../services/GeminiService.js";

/**
 * Tool for analyzing git diffs from local repositories using Gemini models
 *
 * @param req The HTTP request
 * @param res The HTTP response
 * @param services Available services including Gemini service
 * @returns Promise resolving when the operation is complete
 */
export const geminiGitLocalDiffReviewTool: Tool = async (
  req: Request,
  res: Response,
  services: Record<string, unknown>
): Promise<void> => {
  // Type cast services to access geminiService
  const typedServices = services as { geminiService: GeminiService };
  const start = Date.now();
  logger.info("[geminiGitLocalDiffReviewTool] Processing request");

  try {
    // Parse and validate request parameters
    const validatedParams = GeminiGitLocalDiffReviewParamsSchema.parse(
      req.query
    );

    // Extract parameters
    const {
      diffContent,
      model,
      reasoningEffort,
      reviewFocus,
      repositoryContext,
      excludePatterns,
      maxFilesToInclude,
      prioritizeFiles,
      customPrompt,
    } = validatedParams;

    // Create diff options object
    const diffOptions = {
      maxFilesToInclude,
      excludePatterns,
      prioritizeFiles,
    };

    // Call the Gemini Git Diff Service via the GeminiService
    const reviewText = await typedServices.geminiService.reviewGitDiff({
      diffContent,
      modelName: model,
      reasoningEffort,
      reviewFocus,
      repositoryContext,
      diffOptions,
      customPrompt,
    });

    // Send the review result as JSON response
    res.json({
      review: reviewText,
      model: model || "default",
      executionTime: Date.now() - start,
    });
  } catch (error: unknown) {
    // Log error details
    logger.error("[geminiGitLocalDiffReviewTool] Error", { error });

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

export default geminiGitLocalDiffReviewTool;
