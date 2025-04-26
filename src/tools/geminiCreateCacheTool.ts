import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GeminiService } from "../services/index.js";
import { GeminiApiError } from "../utils/errors.js";
import { logger } from "../utils/index.js";
import {
  TOOL_NAME_CREATE_CACHE,
  TOOL_DESCRIPTION_CREATE_CACHE,
  CreateCacheParamsObject, // Import the object of schemas
  CreateCacheParams,
} from "./geminiCreateCacheParams.js";
import { CachedContentMetadata } from "../types/index.js"; // Import our CachedContentMetadata type
import { Content } from "@google/genai"; // Import SDK's Content type for casting

/**
 * Defines and registers the gemini_createCache tool with the MCP server.
 * This tool creates cached content for a compatible Gemini model.
 *
 * @param server - The MCP server instance.
 * @param geminiService - An instance of the GeminiService.
 */
export const geminiCreateCacheTool = (
  server: McpServer,
  geminiService: GeminiService
): void => {
  // Define the tool processing function
  const processRequest = async (
    params: CreateCacheParams
  ): Promise<{ content: { type: "text"; text: string }[] }> => {
    logger.info(
      `Processing ${TOOL_NAME_CREATE_CACHE} request for model: ${params.model}`
    );
    logger.debug("Received params:", params);

    try {
      // Construct options object for the service call
      const cacheOptions: {
        displayName?: string;
        systemInstruction?: Content; // Use SDK Content type
        ttl?: string;
        tools?: any[]; // Use any[] for now, cast properly when passing to the service
        toolConfig?: any; // Use any for now, cast properly when passing to the service
      } = {};
      if (params.displayName) cacheOptions.displayName = params.displayName;
      if (params.ttl) cacheOptions.ttl = params.ttl;
      // Cast systemInstruction if provided, assuming our ContentSchema matches SDK's Content structure
      if (params.systemInstruction)
        cacheOptions.systemInstruction = params.systemInstruction as Content;
      // Add the new tool-related options
      if (params.tools) cacheOptions.tools = params.tools;
      if (params.toolConfig) cacheOptions.toolConfig = params.toolConfig;

      // TODO: Add model compatibility check here before calling service?
      // Or rely on the service/SDK to throw an error. For now, rely on service.

      // Call the GeminiService method with correct argument order
      // Cast contents to SDK's Content[] type
      const cacheMetadata: CachedContentMetadata =
        await geminiService.createCache(
          params.contents as Content[], // contents first
          params.model, // model second
          Object.keys(cacheOptions).length > 0 ? cacheOptions : undefined // options third
        );

      logger.info(`Cache created successfully. Name: ${cacheMetadata.name}`);

      // Return the cache metadata as a JSON string
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(cacheMetadata, null, 2), // Pretty print JSON
          },
        ],
      };
    } catch (error: unknown) {
      logger.error(`Error processing ${TOOL_NAME_CREATE_CACHE}:`, error);

      if (error instanceof GeminiApiError) {
        // Handle specific API errors from the service
        // Check for model incompatibility or invalid TTL (adjust based on actual errors)
        if (
          error.message.toLowerCase().includes("model not compatible") ||
          error.message.toLowerCase().includes("unsupported model")
        ) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Model '${params.model}' does not support caching.`,
            error.details
          );
        }
        if (error.message.toLowerCase().includes("invalid ttl")) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid TTL format: ${params.ttl}`,
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
          "An unknown error occurred while creating the cache."
        );
      }
    }
  };

  // Register the tool with the server
  server.tool(
    TOOL_NAME_CREATE_CACHE,
    TOOL_DESCRIPTION_CREATE_CACHE,
    CreateCacheParamsObject, // Use the object of schemas for registration
    processRequest
  );

  logger.info(`Tool ${TOOL_NAME_CREATE_CACHE} registered.`);
};
