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
  server: McpServer
): void => {
  // Get the GeminiService instance
  const serviceInstance = require("../services/index.js").GeminiService.getInstance();
  /**
   * Processes the request for the gemini_generateImage tool.
   * @param args - The arguments object matching GEMINI_GENERATE_IMAGE_PARAMS.
   * @returns Base64-encoded generated images with metadata for MCP.
   */
  const processRequest = async (args: {
    prompt: string;
    modelName?: string; 
    safetySettings?: any[];
    resolution?: "512x512" | "1024x1024" | "1536x1536";
    numberOfImages?: number;
    negativePrompt?: string;
    stylePreset?: string;
    seed?: number;
    styleStrength?: number;
  }) => {
    logger.debug(`Received ${TOOL_NAME_GENERATE_IMAGE} request:`, {
      model: args.modelName,
      resolution: args.resolution,
      stylePreset: args.stylePreset
    }); // Avoid logging full prompt for privacy/security

    try {
      // Extract arguments - Zod parsing happens automatically via server.tool
      const {
        modelName,
        prompt,
        resolution,
        numberOfImages,
        safetySettings,
        negativePrompt,
        stylePreset,
        seed,
        styleStrength
      } = args;

      // Call the service method with all parameters
      const result: ImageGenerationResult = await serviceInstance.generateImage(
        prompt,
        modelName,
        resolution,
        numberOfImages,
        safetySettings as SafetySetting[] | undefined,
        negativePrompt,
        stylePreset,
        seed,
        styleStrength
      );

      // Check if images were generated
      if (!result.images || result.images.length === 0) {
        throw new Error("No images were generated");
      }

      // Format success output for MCP - provide both JSON and direct image formats
      // This allows clients to choose the most appropriate format for their needs
      // Convert the result to the standard MCP format
      return {
        content: [
          // Include a text description of the generated images
          {
            type: "text" as const,
            text: `Generated ${result.images.length} ${resolution || "1024x1024"} image(s) from prompt.`,
          },
          // Include the generated images as image content types
          ...result.images.map((img) => ({
            type: "image" as const,
            mimeType: img.mimeType,
            data: img.base64Data,
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
    GEMINI_GENERATE_IMAGE_PARAMS.shape, // Use the shape property of the zod object
    processRequest
  );

  logger.info(`Tool registered: ${TOOL_NAME_GENERATE_IMAGE}`);
};
