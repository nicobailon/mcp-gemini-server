import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"; // Removed McpContent
import { z } from "zod";
import {
    GEMINI_STREAM_TOOL_NAME,
    GEMINI_STREAM_TOOL_DESCRIPTION,
    GEMINI_STREAM_PARAMS
} from "./geminiGenerateContentStreamParams.js";
import { GeminiService } from "../services/index.js";
import { GeminiServiceConfig } from "../types/index.js";
import { logger } from "../utils/index.js";
import { GeminiApiError } from "../utils/errors.js"; // Import custom error
// Import SDK types used in parameters for type safety if needed
import type { GenerationConfig, SafetySetting } from '@google/genai';

// Define the type for the arguments object based on the Zod schema
type GeminiStreamArgs = z.infer<z.ZodObject<typeof GEMINI_STREAM_PARAMS>>;

/**
 * Registers the gemini_generateContentStream tool with the MCP server.
 * NOTE: WORKAROUND IMPLEMENTED - This tool currently collects all stream chunks
 * and returns the complete text at the end, due to SDK limitations/uncertainty
 * regarding direct async generator support in server.tool.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiGenerateContentStreamTool = (server: McpServer, serviceInstance: GeminiService): void => {
    // Service instance is now passed in.

    /**
     * Processes the request for the gemini_generateContentStream tool.
     * WORKAROUND: Collects all chunks and returns the full text.
     * @param args - The arguments object matching GEMINI_STREAM_PARAMS.
     * @returns The full concatenated text content for MCP.
     */
    const processRequest = async (args: GeminiStreamArgs) => { // Changed back to regular async function
        logger.debug(`Received ${GEMINI_STREAM_TOOL_NAME} request:`, { model: args.modelName });
        let fullText = ""; // Accumulator for chunks
        try {
            const { modelName, prompt, generationConfig, safetySettings } = args;

            // Call the service's streaming method
            const sdkStream = serviceInstance.generateContentStream(
                prompt, // Correct order: prompt first
                modelName, // modelName second (optional)
                generationConfig as GenerationConfig | undefined,
                safetySettings as SafetySetting[] | undefined
            );

            // Iterate over the async generator from the service and collect chunks
            for await (const chunkText of sdkStream) {
                fullText += chunkText; // Append chunk to the accumulator
            }

            logger.debug(`Stream collected successfully for ${GEMINI_STREAM_TOOL_NAME}`);

            // Return the complete text in the standard MCP format
            return {
                content: [{
                    type: "text" as const,
                    text: fullText
                }]
            };

        } catch (error: unknown) {
            logger.error(`Error processing ${GEMINI_STREAM_TOOL_NAME}:`, error);

            // Map errors to McpError
            if (error instanceof McpError) {
                throw error;
            }
            // Handle specific Gemini API errors from the service
            if (error instanceof GeminiApiError) {
                throw new McpError(
                    ErrorCode.InternalError, // Or potentially a more specific code if identifiable
                    error.message, // Use the message from GeminiApiError
                    error.details
                );
            }
            // TODO: Handle other custom errors

            // Generic internal error for other unexpected issues
            const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred in the tool during streaming.';
            throw new McpError(
                ErrorCode.InternalError,
                `[${GEMINI_STREAM_TOOL_NAME}] Failed: ${errorMessage}`
            );
        }
    };

    // Register the tool using the standard server.tool method.
    server.tool(
        GEMINI_STREAM_TOOL_NAME,
        GEMINI_STREAM_TOOL_DESCRIPTION,
        GEMINI_STREAM_PARAMS,
        processRequest // Pass the regular async function
    );

    logger.info(`Streaming tool (workaround) registered: ${GEMINI_STREAM_TOOL_NAME}`);
};
