import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"; // Removed McpContent
import { z } from "zod";
import {
  GEMINI_STREAM_TOOL_NAME,
  GEMINI_STREAM_TOOL_DESCRIPTION,
  GEMINI_STREAM_PARAMS,
} from "./geminiGenerateContentStreamParams.js";
import { GeminiService } from "../services/index.js";
import { GeminiServiceConfig } from "../types/index.js";
import { logger } from "../utils/index.js";
import { GeminiApiError } from "../utils/errors.js"; // Import custom error
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

      // Call the service's streaming method
      const sdkStream = serviceInstance.generateContentStream(
        prompt, // Correct order: prompt first
        modelName, // modelName second (optional)
        generationConfig as GenerationConfig | undefined,
        safetySettings as SafetySetting[] | undefined,
        // Convert systemInstruction to proper Content type if it's a string
        systemInstruction
          ? typeof systemInstruction === "string"
            ? ({ parts: [{ text: systemInstruction }] } as Content)
            : (systemInstruction as Content)
          : undefined,
        cachedContentName // Pass cached content name
      );

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

      // Map errors to McpError
      if (error instanceof McpError) {
        throw error;
      }
      // Handle specific Gemini API errors from the service
      if (error instanceof GeminiApiError) {
        throw new McpError(
          ErrorCode.InternalError, // Or potentially a more specific code if identifiable
          error.message, // Use the message from GeminiApiError
          error.details
        );
      }
      // TODO: Handle other custom errors

      // Generic internal error for other unexpected issues
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred in the tool during streaming.";
      throw new McpError(
        ErrorCode.InternalError,
        `[${GEMINI_STREAM_TOOL_NAME}] Failed: ${errorMessage}`
      );
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
