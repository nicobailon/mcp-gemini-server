import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GeminiService } from "../services/index.js";
import { GeminiApiError } from "../utils/errors.js";
import { logger } from "../utils/index.js";
import {
  TOOL_NAME_LIST_CACHES,
  TOOL_DESCRIPTION_LIST_CACHES,
  ListCachesParamsObject, // Import the object of schemas
  ListCachesParams,
} from "./geminiListCachesParams.js";
import { CachedContentMetadata } from "../types/index.js"; // Import our type

/**
 * Defines and registers the gemini_listCaches tool with the MCP server.
 * This tool lists available cached content resources.
 *
 * @param server - The MCP server instance.
 * @param geminiService - An instance of the GeminiService.
 */
export const geminiListCachesTool = (
  server: McpServer,
  geminiService: GeminiService
): void => {
  // Define the tool processing function
  const processRequest = async (
    params: ListCachesParams
  ): Promise<{ content: { type: "text"; text: string }[] }> => {
    logger.info(`Processing ${TOOL_NAME_LIST_CACHES} request...`);
    logger.debug("Received params:", params);

    try {
      // Call the GeminiService method
      const result: {
        caches: CachedContentMetadata[];
        nextPageToken?: string;
      } = await geminiService.listCaches(params.pageSize, params.pageToken);

      logger.info(`Successfully listed ${result.caches.length} caches.`);
      if (result.nextPageToken) {
        logger.debug(`Next page token available: ${result.nextPageToken}`);
      } else {
        logger.debug(
          `No next page token returned (iteration method used or last page).`
        );
      }

      // Return the result object (list of caches and optional token) as a JSON string
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2), // Pretty print JSON
          },
        ],
      };
    } catch (error: unknown) {
      logger.error(`Error processing ${TOOL_NAME_LIST_CACHES}:`, error);

      if (error instanceof GeminiApiError) {
        // Map specific errors if needed, otherwise map to internal error
        throw new McpError(
          ErrorCode.InternalError,
          `Gemini API Error: ${error.message}`,
          error.details
        );
      } else if (error instanceof Error) {
        // Handle generic errors
        throw new McpError(
          ErrorCode.InternalError,
          `An unexpected error occurred: ${error.message}`
        );
      } else {
        // Handle unknown errors
        throw new McpError(
          ErrorCode.InternalError,
          "An unknown error occurred while listing caches."
        );
      }
    }
  };

  // Register the tool with the server
  server.tool(
    TOOL_NAME_LIST_CACHES,
    TOOL_DESCRIPTION_LIST_CACHES,
    ListCachesParamsObject, // Use the object of schemas for registration
    processRequest
  );

  logger.info(`Tool ${TOOL_NAME_LIST_CACHES} registered.`);
};
