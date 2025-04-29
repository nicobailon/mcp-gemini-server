import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  TOOL_NAME_GENERATE_IMAGE,
  TOOL_DESCRIPTION_GENERATE_IMAGE,
  GEMINI_GENERATE_IMAGE_PARAMS,
  GeminiGenerateImageArgs,
} from "./geminiGenerateImageParams.js";
import { GeminiService } from "../services/index.js";
import { logger } from "../utils/index.js";
import { GeminiApiError, mapToMcpError } from "../utils/errors.js";
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
      
      // Use the centralized error mapping utility to ensure consistent error handling
      throw mapToMcpError(error, TOOL_NAME_GENERATE_IMAGE);
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
