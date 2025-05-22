import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GeminiService, CacheId } from "../services/index.js";
import {
  GeminiApiError,
  GeminiResourceNotFoundError,
  GeminiInvalidParameterError,
} from "../utils/errors.js";
import { logger } from "../utils/index.js";
import {
  TOOL_NAME_DELETE_CACHE,
  TOOL_DESCRIPTION_DELETE_CACHE,
  DeleteCacheParamsObject, // Import the object of schemas
  DeleteCacheParams,
} from "./geminiDeleteCacheParams.js";

/**
 * Defines and registers the gemini_deleteCache tool with the MCP server.
 * This tool deletes a specific cached content resource.
 *
 * @param server - The MCP server instance.
 * @param geminiService - An instance of the GeminiService.
 */
export const geminiDeleteCacheTool = (
  server: McpServer,
  geminiService: GeminiService
): void => {
  // Define the tool processing function
  const processRequest = async (
    params: DeleteCacheParams
  ): Promise<{ content: { type: "text"; text: string }[] }> => {
    logger.info(
      `Processing ${TOOL_NAME_DELETE_CACHE} request for cache: ${params.cacheName}`
    );
    logger.debug("Received params:", params);

    try {
      // Make sure cacheName is in the correct format and cast it to CacheId
      if (!params.cacheName.startsWith("cachedContents/")) {
        throw new GeminiInvalidParameterError(
          `Cache ID must be in the format "cachedContents/{id}", received: ${params.cacheName}`
        );
      }

      // Call the GeminiService method with proper type casting
      const result: { success: boolean } = await geminiService.deleteCache(
        params.cacheName as CacheId
      );

      logger.info(
        `Successfully processed delete request for cache: ${params.cacheName}`
      );

      // Return the success confirmation as a JSON string
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2), // e.g., {"success": true}
          },
        ],
      };
    } catch (error: unknown) {
      logger.error(
        `Error processing ${TOOL_NAME_DELETE_CACHE} for cache ${params.cacheName}:`,
        error
      );

      if (error instanceof GeminiResourceNotFoundError) {
        // Handle resource not found errors with appropriate error code
        throw new McpError(
          ErrorCode.InvalidParams,
          `Cache not found: ${params.cacheName}`,
          error.details
        );
      } else if (error instanceof GeminiInvalidParameterError) {
        // Handle invalid parameter errors
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid cache name format: ${params.cacheName}`,
          error.details
        );
      } else if (error instanceof GeminiApiError) {
        // Otherwise, map to internal error
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
          "An unknown error occurred while deleting the cache."
        );
      }
    }
  };

  // Register the tool with the server
  server.tool(
    TOOL_NAME_DELETE_CACHE,
    TOOL_DESCRIPTION_DELETE_CACHE,
    DeleteCacheParamsObject, // Use the object of schemas for registration
    processRequest
  );

  logger.info(`Tool ${TOOL_NAME_DELETE_CACHE} registered.`);
};
