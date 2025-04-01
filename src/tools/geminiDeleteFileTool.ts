import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from 'zod';
import { GeminiService } from '../services/index.js';
import { GeminiApiError } from '../utils/errors.js';
import { logger } from '../utils/index.js';
import {
    TOOL_NAME_DELETE_FILE,
    TOOL_DESCRIPTION_DELETE_FILE,
    DeleteFileParamsObject, // Import the object of schemas
    DeleteFileParams
} from './geminiDeleteFileParams.js';

/**
 * Defines and registers the gemini_deleteFile tool with the MCP server.
 * This tool deletes a specific file from the Gemini API.
 *
 * @param server - The MCP server instance.
 * @param geminiService - An instance of the GeminiService.
 */
export const geminiDeleteFileTool = (server: McpServer, geminiService: GeminiService): void => {

    // Define the tool processing function
    const processRequest = async (params: DeleteFileParams): Promise<{ content: { type: 'text', text: string }[] }> => {
        logger.info(`Processing ${TOOL_NAME_DELETE_FILE} request for file: ${params.fileName}`);
        logger.debug("Received params:", params);

        try {
            // Call the GeminiService method
            const result: { success: boolean } = await geminiService.deleteFile(params.fileName);

            logger.info(`Successfully processed delete request for file: ${params.fileName}`);

            // Return the success confirmation as a JSON string
            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify(result, null, 2) // e.g., {"success": true}
                }]
            };
        } catch (error: unknown) {
            logger.error(`Error processing ${TOOL_NAME_DELETE_FILE} for file ${params.fileName}:`, error);

            if (error instanceof GeminiApiError) {
                // Handle specific API errors from the service
                if (error.message.includes('File API is not supported on Vertex AI')) {
                    throw new McpError(ErrorCode.InvalidRequest, `Operation failed: ${error.message}`, error.details);
                }
                // Check for file not found (adjust based on actual error message/code from SDK)
                if (error.message.toLowerCase().includes('not found') || (error.details as any)?.code === 404) {
                    // Use InvalidParams as NotFound is not available
                    throw new McpError(ErrorCode.InvalidParams, `File not found: ${params.fileName}`, error.details);
                }
                if (error.message.includes('Invalid file name format')) {
                    throw new McpError(ErrorCode.InvalidParams, `Invalid file name format: ${params.fileName}`, error.details);
                }
                // Otherwise, map to internal error
                throw new McpError(ErrorCode.InternalError, `Gemini API Error: ${error.message}`, error.details);
            } else if (error instanceof Error) {
                // Handle generic errors
                throw new McpError(ErrorCode.InternalError, `An unexpected error occurred: ${error.message}`);
            } else {
                // Handle unknown errors
                throw new McpError(ErrorCode.InternalError, 'An unknown error occurred while deleting the file.');
            }
        }
    };

    // Register the tool with the server
    server.tool(
        TOOL_NAME_DELETE_FILE,
        TOOL_DESCRIPTION_DELETE_FILE,
        DeleteFileParamsObject, // Use the object of schemas for registration
        processRequest
    );

    logger.info(`Tool ${TOOL_NAME_DELETE_FILE} registered.`);
};
