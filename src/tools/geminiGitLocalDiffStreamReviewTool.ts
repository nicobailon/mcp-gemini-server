import { Request, Response } from "express";
import { Tool } from "@modelcontextprotocol/sdk";
import { logger } from "../utils/logger.js";
import { GeminiGitLocalDiffReviewParamsSchema } from "./geminiGitLocalDiffReviewParams.js";
import { GeminiService } from "../services/GeminiService.js";

/**
 * Tool for streaming analysis of git diffs from local repositories using Gemini models
 *
 * @param req The HTTP request
 * @param res The HTTP response
 * @param services Available services including Gemini service
 * @returns Promise resolving when the operation is complete
 */
export const geminiGitLocalDiffStreamReviewTool: Tool = async (
  req: Request,
  res: Response,
  services: { geminiService: GeminiService }
): Promise<void> => {
  logger.info(
    "[geminiGitLocalDiffStreamReviewTool] Processing streaming request"
  );

  try {
    // Setup streaming response headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Enable response streaming
    res.flushHeaders();

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

    // Get the streaming review generator from the Gemini Service
    const reviewStream = services.geminiService.reviewGitDiffStream({
      diffContent,
      modelName: model,
      reasoningEffort,
      reviewFocus,
      repositoryContext,
      diffOptions,
      customPrompt,
    });

    // Stream chunks to the client
    for await (const chunk of reviewStream) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);

      // Flush the response to ensure chunks are sent immediately
      res.flush?.();
    }

    // Send end of stream marker
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    // Log error details
    logger.error("[geminiGitLocalDiffStreamReviewTool] Error", { error });

    // Send appropriate error response
    let statusCode = 500;
    let errorMessage = "Internal server error";

    if (error.name === "ZodError") {
      statusCode = 400;
      errorMessage = "Invalid parameters: " + JSON.stringify(error.errors);
    } else if (error.name === "GeminiValidationError") {
      statusCode = 400;
      errorMessage = `Validation error: ${error.message} (field: ${error.field})`;
    } else if (error.name === "GeminiApiError") {
      statusCode = 502;
      errorMessage = `Gemini API error: ${error.message}`;
    } else {
      errorMessage = error.message || "Unknown error";
    }

    // For streaming responses, send error in SSE format before ending
    res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    res.end();
  }
};

export default geminiGitLocalDiffStreamReviewTool;
