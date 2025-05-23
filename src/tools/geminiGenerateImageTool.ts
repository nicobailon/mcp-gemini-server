import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  TOOL_NAME_GENERATE_IMAGE,
  TOOL_DESCRIPTION_GENERATE_IMAGE,
  GEMINI_GENERATE_IMAGE_PARAMS,
  GeminiGenerateImageArgs,
} from "./geminiGenerateImageParams.js";
import { GeminiService } from "../services/index.js";
import { logger } from "../utils/index.js";
import { mapToMcpError } from "../utils/errors.js";
import type {
  SafetySetting,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/genai";
import { ImageGenerationResult } from "../types/index.js";

// Helper function to convert safety settings from schema to SDK types
const convertSafetySettings = (
  safetySettings?: Array<{ category: string; threshold: string }>
): SafetySetting[] | undefined => {
  if (!safetySettings) return undefined;

  return safetySettings.map((setting) => ({
    category: setting.category as HarmCategory,
    threshold: setting.threshold as HarmBlockThreshold,
  }));
};

/**
 * Registers the gemini_generateImage tool with the MCP server.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiGenerateImageTool = (server: McpServer): void => {
  // Get the GeminiService instance
  const serviceInstance = new GeminiService();
  /**
   * Processes the request for the gemini_generateImage tool.
   * @param args - The arguments object matching GEMINI_GENERATE_IMAGE_PARAMS.
   * @returns Base64-encoded generated images with metadata for MCP.
   */
  const processRequest = async (args: GeminiGenerateImageArgs) => {
    logger.debug(`Received ${TOOL_NAME_GENERATE_IMAGE} request:`, {
      model: args.modelName,
      resolution: args.resolution,
      stylePreset: args.stylePreset,
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
        styleStrength,
        modelPreferences,
      } = args;

      const result: ImageGenerationResult = await serviceInstance.generateImage(
        prompt,
        modelName,
        resolution,
        numberOfImages,
        convertSafetySettings(safetySettings),
        negativePrompt,
        stylePreset,
        seed,
        styleStrength,
        modelPreferences?.preferQuality,
        modelPreferences?.preferSpeed
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
