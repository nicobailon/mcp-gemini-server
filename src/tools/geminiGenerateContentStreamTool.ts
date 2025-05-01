import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js"; // Removed ErrorCode
import { z } from "zod";
import {
  GEMINI_STREAM_TOOL_NAME,
  GEMINI_STREAM_TOOL_DESCRIPTION,
  GEMINI_STREAM_PARAMS,
} from "./geminiGenerateContentStreamParams.js";
import { GeminiService } from "../services/index.js";
import { GeminiServiceConfig } from "../types/index.js";
import { logger } from "../utils/index.js";
import { GeminiApiError, mapAnyErrorToMcpError } from "../utils/errors.js"; // Import mapAnyErrorToMcpError
// Import SDK types used in parameters for type safety if needed
import type { GenerationConfig, SafetySetting, Content } from "@google/genai";

// Define the type for the arguments object based on the Zod schema
type GeminiStreamArgs = z.infer<z.ZodObject<typeof GEMINI_STREAM_PARAMS>>;

/**
 * Registers the gemini_generateContentStream tool with the MCP server.
 * NOTE: WORKAROUND IMPLEMENTATION REQUIRED - As of April 2025, the @modelcontextprotocol/sdk (1.10.2)
 * does not support true streaming via async generator functions in server.tool().
 * Research indicates the SDK still expects regular async functions rather than async generators.
 * Therefore, this tool must collect all stream chunks and return the complete text at once.
 * When the MCP SDK adds true streaming support in the future, this implementation should be updated.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiGenerateContentStreamTool = (
  server: McpServer,
  serviceInstance: GeminiService
): void => {
  // Service instance is now passed in.

  /**
   * Processes the request for the gemini_generateContentStream tool.
   * WORKAROUND: Collects all chunks and returns the full text.
   * This method cannot be implemented as an async generator function (async function*)
   * because the current MCP SDK does not support yielding content chunks incrementally.
   *
   * @param args - The arguments object matching GEMINI_STREAM_PARAMS.
   * @returns The full concatenated text content for MCP.
   */
  const processRequest = async (args: GeminiStreamArgs) => {
    // Regular async function (not async generator)
    logger.debug(`Received ${GEMINI_STREAM_TOOL_NAME} request:`, {
      model: args.modelName,
    });
    let fullText = ""; // Accumulator for chunks
    try {
      const {
        modelName,
        prompt,
        generationConfig,
        safetySettings,
        systemInstruction,
        cachedContentName,
      } = args;

      // Call the service's streaming method with the new parameter object format
      const sdkStream = serviceInstance.generateContentStream({
        prompt,
        modelName,
        generationConfig: generationConfig as GenerationConfig | undefined,
        safetySettings: safetySettings as SafetySetting[] | undefined,
        systemInstruction, // The method will handle string conversion internally
        cachedContentName,
      });

      // Iterate over the async generator from the service and collect chunks
      // Note: If true streaming were supported, we'd replace this with direct yielding of chunks
      for await (const chunkText of sdkStream) {
        fullText += chunkText; // Append chunk to the accumulator
      }

      logger.debug(
        `Stream collected successfully for ${GEMINI_STREAM_TOOL_NAME}`
      );

      // Return the complete text in the standard MCP format
      return {
        content: [
          {
            type: "text" as const,
            text: fullText,
          },
        ],
      };
    } catch (error: unknown) {
      logger.error(`Error processing ${GEMINI_STREAM_TOOL_NAME}:`, error);

      // Use the centralized error mapping utility to ensure consistent error handling
      throw mapAnyErrorToMcpError(error, GEMINI_STREAM_TOOL_NAME);
    }
  };

  // Register the tool using the standard server.tool method.
  server.tool(
    GEMINI_STREAM_TOOL_NAME,
    GEMINI_STREAM_TOOL_DESCRIPTION,
    GEMINI_STREAM_PARAMS,
    processRequest // Pass the regular async function
  );

  logger.info(
    `Streaming tool (workaround) registered: ${GEMINI_STREAM_TOOL_NAME}`
  );
};
