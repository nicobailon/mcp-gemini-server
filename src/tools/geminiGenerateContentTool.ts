import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  GEMINI_GENERATE_CONTENT_TOOL_NAME,
  GEMINI_GENERATE_CONTENT_TOOL_DESCRIPTION,
  GEMINI_GENERATE_CONTENT_PARAMS,
} from "./geminiGenerateContentParams.js";
import { GeminiService } from "../services/index.js";
import { logger } from "../utils/index.js";
import { mapAnyErrorToMcpError } from "../utils/errors.js"; // Import custom error and mapping utility
// Import SDK types used in parameters for type safety if needed, although Zod infer should handle it
import type {
  SafetySetting,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/genai";

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

// Define the type for the arguments object based on the Zod schema
// This provides type safety within the processRequest function.
type GeminiGenerateContentArgs = z.infer<
  z.ZodObject<typeof GEMINI_GENERATE_CONTENT_PARAMS>
>;

/**
 * Registers the gemini_generateContent tool with the MCP server.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiGenerateContentTool = (
  server: McpServer,
  serviceInstance: GeminiService
): void => {
  // Service instance is now passed in, no need to create it here.

  /**
   * Processes the request for the gemini_generateContent tool.
   * @param args - The arguments object matching GEMINI_GENERATE_CONTENT_PARAMS.
   * @returns The result content for MCP.
   */
  const processRequest = async (args: GeminiGenerateContentArgs) => {
    logger.debug(`Received ${GEMINI_GENERATE_CONTENT_TOOL_NAME} request:`, {
      model: args.modelName,
    }); // Avoid logging full prompt potentially
    try {
      // Extract arguments - Zod parsing happens automatically via server.tool
      const {
        modelName,
        prompt,
        generationConfig,
        safetySettings,
        systemInstruction,
        cachedContentName,
        modelPreferences,
      } = args;

      const resultText = await serviceInstance.generateContent({
        prompt,
        modelName,
        generationConfig,
        safetySettings: convertSafetySettings(safetySettings),
        systemInstruction,
        cachedContentName,
        preferQuality: modelPreferences?.preferQuality,
        preferSpeed: modelPreferences?.preferSpeed,
        preferCost: modelPreferences?.preferCost,
        complexityHint: modelPreferences?.complexityHint,
        taskType: modelPreferences?.taskType,
      });

      // Format the successful output for MCP
      return {
        content: [
          {
            type: "text" as const,
            text: resultText,
          },
        ],
      };
    } catch (error: unknown) {
      logger.error(
        `Error processing ${GEMINI_GENERATE_CONTENT_TOOL_NAME}:`,
        error
      );

      // Use the central error mapping utility
      throw mapAnyErrorToMcpError(error, GEMINI_GENERATE_CONTENT_TOOL_NAME);
    }
  };

  // Register the tool with the server
  server.tool(
    GEMINI_GENERATE_CONTENT_TOOL_NAME,
    GEMINI_GENERATE_CONTENT_TOOL_DESCRIPTION,
    GEMINI_GENERATE_CONTENT_PARAMS, // Pass the Zod schema object directly
    processRequest
  );

  logger.info(`Tool registered: ${GEMINI_GENERATE_CONTENT_TOOL_NAME}`);
};
