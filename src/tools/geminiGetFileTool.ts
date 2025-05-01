import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GeminiService, FileId } from "../services/index.js";
import {
  GeminiApiError,
  GeminiResourceNotFoundError,
  GeminiInvalidParameterError,
} from "../utils/errors.js";
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
      // Make sure fileName is in the correct format and cast it to FileId
      if (!params.fileName.startsWith("files/")) {
        throw new GeminiInvalidParameterError(
          `File ID must be in the format "files/{file_id}", received: ${params.fileName}`
        );
      }

      // Call the GeminiService method with proper type casting
      const fileMetadata: FileMetadata = await geminiService.getFile(
        params.fileName as FileId
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

      if (error instanceof GeminiResourceNotFoundError) {
        // Handle resource not found errors with appropriate error code
        throw new McpError(
          ErrorCode.InvalidParams,
          `File not found: ${params.fileName}`,
          error.details
        );
      } else if (error instanceof GeminiInvalidParameterError) {
        // Handle invalid parameter errors
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid file name format: ${params.fileName}`,
          error.details
        );
      } else if (error instanceof GeminiApiError) {
        // Handle other specific API errors from the service
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
