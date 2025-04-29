import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  TOOL_NAME_GENERATE_IMAGE,
  TOOL_DESCRIPTION_GENERATE_IMAGE,
  GEMINI_GENERATE_IMAGE_PARAMS,
  GeminiGenerateImageArgs,
} from "./geminiGenerateImageParams.js";
import { GeminiService } from "../services/index.js";
import { logger } from "../utils/index.js";
import { GeminiApiError } from "../utils/errors.js";
import type { SafetySetting } from "@google/genai";
import { ImageGenerationResult } from "../types/index.js";

/**
 * Registers the gemini_generateImage tool with the MCP server.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiGenerateImageTool = (
  server: McpServer,
  serviceInstance: GeminiService
): void => {
  /**
   * Processes the request for the gemini_generateImage tool.
   * @param args - The arguments object matching GEMINI_GENERATE_IMAGE_PARAMS.
   * @returns Base64-encoded generated images with metadata for MCP.
   */
  const processRequest = async (args: GeminiGenerateImageArgs) => {
    logger.debug(`Received ${TOOL_NAME_GENERATE_IMAGE} request:`, {
      model: args.modelName,
    }); // Avoid logging full prompt

    try {
      // Extract arguments - Zod parsing happens automatically via server.tool
      const {
        modelName,
        prompt,
        resolution,
        numberOfImages,
        safetySettings,
        negativePrompt,
      } = args;

      // Call the service method
      const result: ImageGenerationResult = await serviceInstance.generateImage(
        prompt,
        modelName,
        resolution,
        numberOfImages,
        safetySettings as SafetySetting[] | undefined,
        negativePrompt
      );

      // Check if images were generated
      if (!result.images || result.images.length === 0) {
        throw new Error("No images were generated");
      }

      // Format success output for MCP - provide both JSON and direct image formats
      // This allows clients to choose the most appropriate format for their needs
      return {
        content: [
          {
            type: "json" as const,
            json: result,
          },
          ...result.images.map((img) => ({
            type: "image" as const,
            image: {
              data: img.base64Data,
              mimeType: img.mimeType,
              width: img.width,
              height: img.height,
            },
          })),
        ],
      };
    } catch (error: unknown) {
      logger.error(`Error processing ${TOOL_NAME_GENERATE_IMAGE}:`, error);

      // Map errors to appropriate McpError types
      if (error instanceof McpError) {
        throw error; // Re-throw existing McpErrors
      }

      // Handle Gemini API errors with enhanced mapping to appropriate MCP error codes
      if (error instanceof GeminiApiError) {
        const errorMessage = error.message;
        const errorDetails = error.details;

        // Check for specific error types
        if (
          errorMessage.includes("safety") ||
          errorMessage.includes("blocked")
        ) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Content blocked by safety settings: ${errorMessage}`,
            errorDetails
          );
        } else if (
          errorMessage.includes("quota") ||
          errorMessage.includes("rate limit") ||
          errorMessage.includes("Resource has been exhausted") ||
          (errorDetails && JSON.stringify(errorDetails).includes("429"))
        ) {
          throw new McpError(
            ErrorCode.ResourceExhausted,
            `Quota exceeded or rate limit hit: ${errorMessage}`,
            errorDetails
          );
        } else if (
          errorMessage.includes("permission") ||
          errorMessage.includes("not authorized") ||
          errorMessage.includes("forbidden") ||
          (errorDetails && JSON.stringify(errorDetails).includes("403"))
        ) {
          throw new McpError(
            ErrorCode.PermissionDenied,
            `Permission denied: ${errorMessage}`,
            errorDetails
          );
        } else if (
          errorMessage.includes("not found") ||
          errorMessage.includes("does not exist") ||
          (errorDetails && JSON.stringify(errorDetails).includes("404"))
        ) {
          throw new McpError(
            ErrorCode.NotFound,
            `Resource not found: ${errorMessage}`,
            errorDetails
          );
        } else if (
          errorMessage.includes("invalid argument") ||
          errorMessage.includes("invalid parameter") ||
          errorMessage.includes("invalid request") ||
          errorMessage.includes("failed precondition") ||
          (errorDetails && JSON.stringify(errorDetails).includes("400"))
        ) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${errorMessage}`,
            errorDetails
          );
        } else if (
          errorMessage.includes("not supported") ||
          errorMessage.includes("unsupported") ||
          errorMessage.includes("model does not support")
        ) {
          // Handle cases where the model doesn't support image generation
          throw new McpError(
            ErrorCode.InvalidParams,
            `Image generation not supported by this model: ${errorMessage}`,
            errorDetails
          );
        } else {
          // Default to internal error
          throw new McpError(
            ErrorCode.InternalError,
            errorMessage,
            errorDetails
          );
        }
      }

      // Handle ValidationError and map to InvalidParams
      if (error instanceof Error && error.name === "ValidationError") {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Validation error: ${error.message}`
        );
      }

      // Handle unexpected errors
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred in the tool.";
      throw new McpError(
        ErrorCode.InternalError,
        `[${TOOL_NAME_GENERATE_IMAGE}] Failed: ${errorMessage}`
      );
    }
  };

  // Register the tool with the server
  server.tool(
    TOOL_NAME_GENERATE_IMAGE,
    TOOL_DESCRIPTION_GENERATE_IMAGE,
    GEMINI_GENERATE_IMAGE_PARAMS,
    processRequest
  );

  logger.info(`Tool registered: ${TOOL_NAME_GENERATE_IMAGE}`);
};
