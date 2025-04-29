import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"; // Reverted import path and name based on guide example
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GeminiService } from "../services/index.js";
import { GeminiApiError, ValidationError, mapToMcpError } from "../utils/errors.js";
import { logger, validateAndResolvePath } from "../utils/index.js";
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
      // Validate and resolve the file path to ensure it's secure
      const safeFilePath = validateAndResolvePath(params.filePath, {
        mustExist: true,
      });

      // Construct metadata object for the service call if needed
      const fileMetadataParams: { displayName?: string; mimeType?: string } =
        {};
      if (params.displayName) {
        fileMetadataParams.displayName = params.displayName;
      }
      if (params.mimeType) {
        fileMetadataParams.mimeType = params.mimeType;
      }

      // Call the GeminiService method with the validated path
      const fileMetadata: FileMetadata = await geminiService.uploadFile(
        safeFilePath,
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
      
      // Use the centralized error mapping utility to ensure consistent error mapping
      throw mapToMcpError(error, TOOL_NAME_UPLOAD_FILE);
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
