import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"; // Reverted import path and name based on guide example
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GeminiService } from "../services/index.js";
import { GeminiApiError } from "../utils/errors.js";
import { logger } from "../utils/index.js";
import {
  TOOL_NAME_UPLOAD_FILE,
  TOOL_DESCRIPTION_UPLOAD_FILE,
  UploadFileParamsObject, // Import the object of schemas
  UploadFileParams, // Keep importing the combined type for the function signature
} from "./geminiUploadFileParams.js";
import { FileMetadata } from "../types/index.js"; // Import our FileMetadata type

/**
 * Defines and registers the gemini_uploadFile tool with the MCP server.
 * This tool uploads a local file to the Gemini API.
 *
 * @param server - The MCP server instance.
 * @param geminiService - An instance of the GeminiService.
 */
export const geminiUploadFileTool = (
  server: McpServer,
  geminiService: GeminiService
): void => {
  // Define the tool processing function
  const processRequest = async (
    params: UploadFileParams
  ): Promise<{ content: { type: "text"; text: string }[] }> => {
    logger.info(`Processing ${TOOL_NAME_UPLOAD_FILE} request...`);
    logger.debug("Received params:", params);

    try {
      // Construct metadata object for the service call if needed
      const fileMetadataParams: { displayName?: string; mimeType?: string } =
        {};
      if (params.displayName) {
        fileMetadataParams.displayName = params.displayName;
      }
      if (params.mimeType) {
        fileMetadataParams.mimeType = params.mimeType;
      }

      // Call the GeminiService method
      const fileMetadata: FileMetadata = await geminiService.uploadFile(
        params.filePath,
        Object.keys(fileMetadataParams).length > 0
          ? fileMetadataParams
          : undefined
      );

      logger.info(`File uploaded successfully. Name: ${fileMetadata.name}`);

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
      logger.error(`Error processing ${TOOL_NAME_UPLOAD_FILE}:`, error);

      if (error instanceof GeminiApiError) {
        // Handle specific API errors from the service
        // Check if it's a "File API not supported on Vertex" error
        if (error.message.includes("File API is not supported on Vertex AI")) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Operation failed: ${error.message}`,
            error.details
          );
        }
        // Check for invalid file path or other specific errors if possible
        if (
          error.message.includes("ENOENT") ||
          error.message.toLowerCase().includes("file not found")
        ) {
          // Example check
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid file path: ${params.filePath}`,
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
          "An unknown error occurred during file upload."
        );
      }
    }
  };

  // Register the tool with the server
  server.tool(
    TOOL_NAME_UPLOAD_FILE,
    TOOL_DESCRIPTION_UPLOAD_FILE,
    UploadFileParamsObject, // Use the object of schemas for registration
    processRequest
  );

  logger.info(`Tool ${TOOL_NAME_UPLOAD_FILE} registered.`);
};
