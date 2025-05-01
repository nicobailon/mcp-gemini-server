import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import {
  GEMINI_START_CHAT_TOOL_NAME,
  GEMINI_START_CHAT_TOOL_DESCRIPTION,
  GEMINI_START_CHAT_PARAMS,
  GeminiStartChatArgs, // Import the type helper
} from "./geminiStartChatParams.js";
import { GeminiService } from "../services/index.js";
import { GeminiServiceConfig } from "../types/index.js";
import { logger } from "../utils/index.js";
import { GeminiApiError, mapAnyErrorToMcpError } from "../utils/errors.js";
// Import SDK types used in parameters for type safety if needed
import type {
  Content,
  GenerationConfig,
  SafetySetting,
  Tool,
} from "@google/genai"; // Added Tool

/**
 * Registers the gemini_startChat tool with the MCP server.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiStartChatTool = (
  server: McpServer,
  serviceInstance: GeminiService
): void => {
  // Service instance is now passed in.

  /**
   * Processes the request for the gemini_startChat tool.
   * @param args - The arguments object matching GEMINI_START_CHAT_PARAMS.
   * @returns The result containing the new sessionId.
   */
  const processRequest = async (args: GeminiStartChatArgs) => {
    logger.debug(`Received ${GEMINI_START_CHAT_TOOL_NAME} request:`, {
      model: args.modelName,
    });
    try {
      // Destructure all arguments including the new parameters
      const {
        modelName,
        history,
        tools,
        generationConfig,
        safetySettings,
        systemInstruction,
        cachedContentName,
      } = args;

      // Call the service to start the chat session with the new parameter object format
      const sessionId = serviceInstance.startChatSession({
        modelName,
        history: history as Content[] | undefined,
        generationConfig: generationConfig as GenerationConfig | undefined,
        safetySettings: safetySettings as SafetySetting[] | undefined,
        tools: tools as Tool[] | undefined,
        systemInstruction, // The method will handle string conversion internally
        cachedContentName,
      });

      logger.info(
        `Successfully started chat session ${sessionId} for model ${modelName}`
      );

      // Return the sessionId in the expected MCP format
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ sessionId }), // Return sessionId as JSON string
          },
        ],
      };
    } catch (error: unknown) {
      logger.error(`Error processing ${GEMINI_START_CHAT_TOOL_NAME}:`, error);

      // Use the centralized error mapping utility to ensure consistent error handling
      throw mapAnyErrorToMcpError(error, GEMINI_START_CHAT_TOOL_NAME);
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
