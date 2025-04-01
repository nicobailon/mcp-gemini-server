import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
    GEMINI_START_CHAT_TOOL_NAME,
    GEMINI_START_CHAT_TOOL_DESCRIPTION,
    GEMINI_START_CHAT_PARAMS,
    GeminiStartChatArgs // Import the type helper
} from "./geminiStartChatParams.js";
import { GeminiService } from "../services/index.js";
import { GeminiServiceConfig } from "../types/index.js";
import { logger } from "../utils/index.js";
import { GeminiApiError } from "../utils/errors.js";
// Import SDK types used in parameters for type safety if needed
import type { Content, GenerationConfig, SafetySetting, Tool } from '@google/genai'; // Added Tool

/**
 * Registers the gemini_startChat tool with the MCP server.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiStartChatTool = (server: McpServer, serviceInstance: GeminiService): void => {
    // Service instance is now passed in.

    /**
     * Processes the request for the gemini_startChat tool.
     * @param args - The arguments object matching GEMINI_START_CHAT_PARAMS.
     * @returns The result containing the new sessionId.
     */
    const processRequest = async (args: GeminiStartChatArgs) => {
        logger.debug(`Received ${GEMINI_START_CHAT_TOOL_NAME} request:`, { model: args.modelName });
        try {
            // Destructure all arguments including the new 'tools'
            const { modelName, history, tools, generationConfig, safetySettings } = args;

            // Call the service to start the chat session
            // Need to cast history and tools if the Zod schemas don't perfectly match SDK types
            const sessionId = serviceInstance.startChatSession(
                modelName,
                history as Content[] | undefined,
                generationConfig as GenerationConfig | undefined,
                safetySettings as SafetySetting[] | undefined,
                tools as Tool[] | undefined // Pass tools to the service method
            );

            logger.info(`Successfully started chat session ${sessionId} for model ${modelName}`);

            // Return the sessionId in the expected MCP format
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ sessionId }) // Return sessionId as JSON string
                }]
            };

        } catch (error: unknown) {
            logger.error(`Error processing ${GEMINI_START_CHAT_TOOL_NAME}:`, error);

            // Map errors to McpError
            if (error instanceof McpError) {
                throw error;
            }
            if (error instanceof GeminiApiError) {
                throw new McpError(
                    ErrorCode.InternalError, // Or potentially a more specific code
                    error.message,
                    error.details
                );
            }

            // Generic internal error
            const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred starting chat session.';
            throw new McpError(
                ErrorCode.InternalError,
                `[${GEMINI_START_CHAT_TOOL_NAME}] Failed: ${errorMessage}`
            );
        }
    };

    // Register the tool
    server.tool(
        GEMINI_START_CHAT_TOOL_NAME,
        GEMINI_START_CHAT_TOOL_DESCRIPTION,
        GEMINI_START_CHAT_PARAMS,
        processRequest
    );

    logger.info(`Tool registered: ${GEMINI_START_CHAT_TOOL_NAME}`);
};
