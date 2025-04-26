import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"; // Use correct path based on previous fix
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"; // Use correct path based on previous fix
import { z } from "zod";
import { GeminiService } from "../services/index.js";
import { GeminiApiError } from "../utils/errors.js";
import { logger } from "../utils/index.js";
import {
  TOOL_NAME_LIST_FILES,
  TOOL_DESCRIPTION_LIST_FILES,
  ListFilesParamsObject, // Import the object of schemas
  ListFilesParams,
} from "./geminiListFilesParams.js";
import { FileMetadata } from "../types/index.js"; // Import our FileMetadata type

/**
 * Defines and registers the gemini_listFiles tool with the MCP server.
 * This tool lists files previously uploaded to the Gemini API.
 *
 * @param server - The MCP server instance.
 * @param geminiService - An instance of the GeminiService.
 */
export const geminiListFilesTool = (
  server: McpServer,
  geminiService: GeminiService
): void => {
  // Define the tool processing function
  const processRequest = async (
    params: ListFilesParams
  ): Promise<{ content: { type: "text"; text: string }[] }> => {
    logger.info(`Processing ${TOOL_NAME_LIST_FILES} request...`);
    logger.debug("Received params:", params);

    try {
      // Call the GeminiService method
      const result: { files: FileMetadata[]; nextPageToken?: string } =
        await geminiService.listFiles(params.pageSize, params.pageToken);

      logger.info(`Successfully listed ${result.files.length} files.`);
      if (result.nextPageToken) {
        logger.debug(`Next page token available: ${result.nextPageToken}`);
      }

      // Return the result object (list of files and optional token) as a JSON string
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2), // Pretty print JSON
          },
        ],
      };
    } catch (error: unknown) {
      logger.error(`Error processing ${TOOL_NAME_LIST_FILES}:`, error);

      if (error instanceof GeminiApiError) {
        // Handle specific API errors from the service
        if (error.message.includes("File API is not supported on Vertex AI")) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Operation failed: ${error.message}`,
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
          "An unknown error occurred while listing files."
        );
      }
    }
  };

  // Register the tool with the server
  server.tool(
    TOOL_NAME_LIST_FILES,
    TOOL_DESCRIPTION_LIST_FILES,
    ListFilesParamsObject, // Use the object of schemas for registration
    processRequest
  );

  logger.info(`Tool ${TOOL_NAME_LIST_FILES} registered.`);
};
