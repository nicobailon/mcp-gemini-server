import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GeminiService } from "../services/index.js";
import { GeminiApiError } from "../utils/errors.js";
import { logger } from "../utils/index.js";
import {
  TOOL_NAME_UPDATE_CACHE,
  TOOL_DESCRIPTION_UPDATE_CACHE,
  UpdateCacheParamsObject, // Import the object of schemas
  UpdateCacheParams,
} from "./geminiUpdateCacheParams.js";
import { CachedContentMetadata } from "../types/index.js"; // Import our type

/**
 * Defines and registers the gemini_updateCache tool with the MCP server.
 * This tool updates metadata for a specific cached content resource.
 *
 * @param server - The MCP server instance.
 * @param geminiService - An instance of the GeminiService.
 */
export const geminiUpdateCacheTool = (
  server: McpServer,
  geminiService: GeminiService
): void => {
  // Define the tool processing function
  const processRequest = async (
    params: UpdateCacheParams
  ): Promise<{ content: { type: "text"; text: string }[] }> => {
    logger.info(
      `Processing ${TOOL_NAME_UPDATE_CACHE} request for cache: ${params.cacheName}`
    );
    logger.debug("Received params:", params);

    try {
      // Construct the updates object for the service call
      const updates: { ttl?: string; displayName?: string } = {};
      if (params.ttl) updates.ttl = params.ttl;
      if (params.displayName) updates.displayName = params.displayName;

      // Call the GeminiService method
      const cacheMetadata: CachedContentMetadata =
        await geminiService.updateCache(params.cacheName, updates);

      logger.info(
        `Successfully updated metadata for cache: ${cacheMetadata.name}`
      );

      // Return the updated cache metadata as a JSON string
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(cacheMetadata, null, 2), // Pretty print JSON
          },
        ],
      };
    } catch (error: unknown) {
      logger.error(
        `Error processing ${TOOL_NAME_UPDATE_CACHE} for cache ${params.cacheName}:`,
        error
      );

      if (error instanceof GeminiApiError) {
        // Handle specific API errors from the service
        // Check for cache not found (adjust based on actual error message/code from SDK)
        if (
          error.message.toLowerCase().includes("not found") ||
          (error.details as any)?.code === 404
        ) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Cache not found: ${params.cacheName}`,
            error.details
          ); // Use InvalidParams
        }
        if (error.message.includes("Invalid cache name format")) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid cache name format: ${params.cacheName}`,
            error.details
          );
        }
        if (error.message.toLowerCase().includes("invalid ttl")) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid TTL format provided: ${params.ttl}`,
            error.details
          );
        }
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
          "An unknown error occurred while updating cache metadata."
        );
      }
    }
  };

  // Register the tool with the server
  server.tool(
    TOOL_NAME_UPDATE_CACHE,
    TOOL_DESCRIPTION_UPDATE_CACHE,
    UpdateCacheParamsObject, // Use the object of schemas for registration
    processRequest
  );

  logger.info(`Tool ${TOOL_NAME_UPDATE_CACHE} registered.`);
};
