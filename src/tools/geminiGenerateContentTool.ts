import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
    GEMINI_GENERATE_CONTENT_TOOL_NAME,
    GEMINI_GENERATE_CONTENT_TOOL_DESCRIPTION,
    GEMINI_GENERATE_CONTENT_PARAMS
} from "./geminiGenerateContentParams.js";
import { GeminiService } from "../services/index.js";
import { GeminiServiceConfig } from "../types/index.js";
import { logger } from "../utils/index.js";
import { GeminiApiError } from "../utils/errors.js"; // Import custom error
// Import SDK types used in parameters for type safety if needed, although Zod infer should handle it
import type { GenerationConfig, SafetySetting } from '@google/genai';

// Define the type for the arguments object based on the Zod schema
// This provides type safety within the processRequest function.
type GeminiGenerateContentArgs = z.infer<z.ZodObject<typeof GEMINI_GENERATE_CONTENT_PARAMS>>;

/**
 * Registers the gemini_generateContent tool with the MCP server.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiGenerateContentTool = (server: McpServer, serviceInstance: GeminiService): void => {
    // Service instance is now passed in, no need to create it here.

    /**
     * Processes the request for the gemini_generateContent tool.
     * @param args - The arguments object matching GEMINI_GENERATE_CONTENT_PARAMS.
     * @returns The result content for MCP.
     */
    const processRequest = async (args: GeminiGenerateContentArgs) => {
        logger.debug(`Received ${GEMINI_GENERATE_CONTENT_TOOL_NAME} request:`, { model: args.modelName }); // Avoid logging full prompt potentially
        try {
            // Extract arguments - Zod parsing happens automatically via server.tool
            const { modelName, prompt, generationConfig, safetySettings } = args;

            // Call the service method
            // Zod schema types should align with SDK types expected by the service method
            const resultText = await serviceInstance.generateContent(
                prompt, // Correct order: prompt first
                modelName, // modelName second (optional)
                generationConfig as GenerationConfig | undefined, // Cast if necessary, Zod optional maps to undefined
                safetySettings as SafetySetting[] | undefined   // Cast if necessary
            );

            // Format the successful output for MCP
            return {
                content: [{
                    type: "text" as const,
                    text: resultText
                }]
            };

        } catch (error: unknown) {
            logger.error(`Error processing ${GEMINI_GENERATE_CONTENT_TOOL_NAME}:`, error);

            // Map errors to McpError
            if (error instanceof McpError) {
                // Re-throw existing McpErrors (e.g., from potential future validation layer)
                throw error;
            }
            // Handle specific Gemini API errors from the service
            if (error instanceof GeminiApiError) {
                // Map to InternalError for now, but provide specific message
                // Could potentially map to other codes like PermissionDenied based on error details later
                throw new McpError(
                    ErrorCode.InternalError, // Or potentially a more specific code if identifiable
                    error.message, // Use the message from GeminiApiError (already includes "Gemini API Error:")
                    error.details // Pass along any details
                );
            }
            // TODO: Handle other custom errors like ValidationError if added

            // Generic internal error for other unexpected issues
            const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred in the tool.';
            throw new McpError(
                ErrorCode.InternalError,
                `[${GEMINI_GENERATE_CONTENT_TOOL_NAME}] Failed: ${errorMessage}`
            );
        }
    };

    // Register the tool with the server
    server.tool(
        GEMINI_GENERATE_CONTENT_TOOL_NAME,
        GEMINI_GENERATE_CONTENT_TOOL_DESCRIPTION,
        GEMINI_GENERATE_CONTENT_PARAMS, // Pass the Zod schema object directly
        processRequest
    );

    logger.info(`Tool registered: ${GEMINI_GENERATE_CONTENT_TOOL_NAME}`);
};
