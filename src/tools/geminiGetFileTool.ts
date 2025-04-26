import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GeminiService } from "../services/index.js";
import { GeminiApiError } from "../utils/errors.js";
import { logger } from "../utils/index.js";
import {
  TOOL_NAME_GET_FILE,
  TOOL_DESCRIPTION_GET_FILE,
  GetFileParamsObject, // Import the object of schemas
  GetFileParams,
} from "./geminiGetFileParams.js";
import { FileMetadata } from "../types/index.js"; // Import our FileMetadata type

/**
 * Defines and registers the gemini_getFile tool with the MCP server.
 * This tool retrieves metadata for a specific file from the Gemini API.
 *
 * @param server - The MCP server instance.
 * @param geminiService - An instance of the GeminiService.
 */
export const geminiGetFileTool = (
  server: McpServer,
  geminiService: GeminiService
): void => {
  // Define the tool processing function
  const processRequest = async (
    params: GetFileParams
  ): Promise<{ content: { type: "text"; text: string }[] }> => {
    logger.info(
      `Processing ${TOOL_NAME_GET_FILE} request for file: ${params.fileName}`
    );
    logger.debug("Received params:", params);

    try {
      // Call the GeminiService method
      const fileMetadata: FileMetadata = await geminiService.getFile(
        params.fileName
      );

      logger.info(
        `Successfully retrieved metadata for file: ${fileMetadata.name}`
      );

      // Return the file metadata as a JSON string
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(fileMetadata, null, 2), // Pretty print JSON
          },
        ],
      };
    } catch (error: unknown) {
      logger.error(
        `Error processing ${TOOL_NAME_GET_FILE} for file ${params.fileName}:`,
        error
      );

      if (error instanceof GeminiApiError) {
        // Handle specific API errors from the service
        if (error.message.includes("File API is not supported on Vertex AI")) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Operation failed: ${error.message}`,
            error.details
          );
        }
        // Check for file not found (adjust based on actual error message/code from SDK)
        // Use InvalidParams as NotFound is not available in ErrorCode enum
        if (
          error.message.toLowerCase().includes("not found") ||
          (error.details as any)?.code === 404
        ) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `File not found: ${params.fileName}`,
            error.details
          );
        }
        if (error.message.includes("Invalid file name format")) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid file name format: ${params.fileName}`,
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
          "An unknown error occurred while getting file metadata."
        );
      }
    }
  };

  // Register the tool with the server
  server.tool(
    TOOL_NAME_GET_FILE,
    TOOL_DESCRIPTION_GET_FILE,
    GetFileParamsObject, // Use the object of schemas for registration
    processRequest
  );

  logger.info(`Tool ${TOOL_NAME_GET_FILE} registered.`);
};
