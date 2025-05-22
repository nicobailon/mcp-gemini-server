import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  GEMINI_STREAM_TOOL_NAME,
  GEMINI_STREAM_TOOL_DESCRIPTION,
  GEMINI_STREAM_PARAMS,
} from "./geminiGenerateContentStreamParams.js";
import { GeminiService } from "../services/index.js";
import { logger } from "../utils/index.js";
import { mapAnyErrorToMcpError } from "../utils/errors.js";
// Import SDK types used in parameters for type safety if needed
import type { GenerationConfig, SafetySetting } from "@google/genai";

// Define the type for the arguments object based on the Zod schema
type GeminiStreamArgs = z.infer<z.ZodObject<typeof GEMINI_STREAM_PARAMS>>;

/**
 * Registers the gemini_generateContentStream tool with the MCP server.
 * NOTE: This tool now leverages the StreamableHTTPServerTransport for true streaming
 * when used with the HTTP transport. When used with other transports, it falls back
 * to collecting all chunks and returning the complete text.
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
   * For HTTP transport: The StreamableHTTPServerTransport handles the streaming automatically
   * For other transports: Collects all chunks and returns the full text
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
      // The StreamableHTTPServerTransport will handle the actual streaming for HTTP transport
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
    `Streaming tool registered: ${GEMINI_STREAM_TOOL_NAME} (HTTP transport provides native streaming)`
  );
};
