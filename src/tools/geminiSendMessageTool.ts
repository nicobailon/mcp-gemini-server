import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  McpError,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import {
  GEMINI_SEND_MESSAGE_TOOL_NAME,
  GEMINI_SEND_MESSAGE_TOOL_DESCRIPTION,
  GEMINI_SEND_MESSAGE_PARAMS,
  GeminiSendMessageArgs, // Import the type helper
} from "./geminiSendMessageParams.js";
import { GeminiService } from "../services/index.js";
import { GeminiServiceConfig } from "../types/index.js";
import { logger } from "../utils/index.js";
import { GeminiApiError, mapAnyErrorToMcpError } from "../utils/errors.js";
// Import SDK types used in parameters/response handling
// Separate type-only imports from value imports
import { BlockedReason, FinishReason } from "@google/genai"; // Import enums as values
import type {
  GenerationConfig,
  SafetySetting,
  GenerateContentResponse,
  FunctionCall,
  Tool,
  ToolConfig,
} from "@google/genai"; // Added ToolConfig

/**
 * Registers the gemini_sendMessage tool with the MCP server.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiSendMessageTool = (
  server: McpServer,
  serviceInstance: GeminiService
): void => {
  // Service instance is now passed in.

  /**
   * Processes the request for the gemini_sendMessage tool.
   * @param args - The arguments object matching GEMINI_SEND_MESSAGE_PARAMS.
   * @returns The result containing the model's response (text or function call).
   */
  const processRequest = async (
    args: GeminiSendMessageArgs
  ): Promise<CallToolResult> => {
    logger.debug(
      `Received ${GEMINI_SEND_MESSAGE_TOOL_NAME} request for session: ${args.sessionId}`
    );
    try {
      // Destructure all arguments including all parameters
      const {
        sessionId,
        message,
        generationConfig,
        safetySettings,
        tools,
        toolConfig,
        cachedContentName,
      } = args;

      // Call the service to send the message with the new parameter object format
      const response: GenerateContentResponse =
        await serviceInstance.sendMessageToSession({
          sessionId,
          message,
          generationConfig: generationConfig as GenerationConfig | undefined,
          safetySettings: safetySettings as SafetySetting[] | undefined,
          tools: tools as Tool[] | undefined,
          toolConfig: toolConfig as ToolConfig | undefined,
          cachedContentName
        });

      // --- Process the SDK Response into MCP Format ---

      // Check for prompt safety blocks first
      if (response.promptFeedback?.blockReason === BlockedReason.SAFETY) {
        logger.warn(
          `Gemini prompt blocked due to SAFETY for session ${sessionId}.`
        );
        // Return an error-like response via MCP content
        return {
          content: [
            {
              type: "text",
              text: `Error: Prompt blocked due to safety settings. Reason: ${response.promptFeedback.blockReason}`,
            },
          ],
          isError: true, // Indicate an error occurred
        };
      }

      const firstCandidate = response?.candidates?.[0];

      // Check for candidate safety blocks or other non-STOP finish reasons
      if (
        firstCandidate?.finishReason &&
        firstCandidate.finishReason !== FinishReason.STOP &&
        firstCandidate.finishReason !== FinishReason.MAX_TOKENS
      ) {
        if (firstCandidate.finishReason === FinishReason.SAFETY) {
          logger.warn(
            `Gemini response stopped due to SAFETY for session ${sessionId}.`
          );
          return {
            content: [
              {
                type: "text",
                text: `Error: Response generation stopped due to safety settings. FinishReason: ${firstCandidate.finishReason}`,
              },
            ],
            isError: true,
          };
        }
        // Handle other potentially problematic finish reasons if needed
        logger.warn(
          `Gemini response finished with reason ${firstCandidate.finishReason} for session ${sessionId}.`
        );
        // Decide if this should be an error or just potentially empty content
      }

      let functionCalls: FunctionCall[] | undefined;
      let responseText: string | undefined;

      // Extract function calls or text from the response parts
      if (firstCandidate?.content?.parts) {
        functionCalls = firstCandidate.content.parts
          .map((part) => part.functionCall)
          .filter((fc): fc is FunctionCall => !!fc); // Filter out undefined/null

        if (!functionCalls || functionCalls.length === 0) {
          // If no function calls, concatenate text parts
          responseText = firstCandidate.content.parts
            .filter((part) => typeof part.text === "string")
            .map((part) => part.text)
            .join("");
        }
      }

      // Format the MCP response content
      if (functionCalls && functionCalls.length > 0) {
        logger.debug(
          `Returning function call(s) for session ${sessionId}: ${functionCalls.map((fc) => fc.name).join(", ")}`
        );
        // Serialize function call(s) as JSON text for MCP
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ functionCalls: functionCalls }), // Standard way to return structured data
            },
          ],
        };
      } else if (responseText !== undefined) {
        // Includes empty string case
        logger.debug(`Returning text response for session ${sessionId}.`);
        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      } else {
        // Handle cases where there's no candidate or no parts, but no explicit error/block
        logger.warn(
          `No text or function call found in Gemini response for session ${sessionId}, finishReason: ${firstCandidate?.finishReason}. Returning empty content.`
        );
        return { content: [{ type: "text", text: "" }] }; // Return empty text content
      }
      // --- End Response Processing ---
    } catch (error: unknown) {
      logger.error(
        `Error processing ${GEMINI_SEND_MESSAGE_TOOL_NAME} for session ${args.sessionId}:`,
        error
      );
      
      // Enhance error details with session ID for better debugging
      // Make a copy of the error to add session context before mapping
      let errorWithContext = error;
      if (error instanceof GeminiApiError && error.details) {
        const geminiErrorWithContext = error as GeminiApiError;
        geminiErrorWithContext.details = {
          ...geminiErrorWithContext.details,
          sessionId: args.sessionId
        };
        errorWithContext = geminiErrorWithContext;
      }
      
      // Use the centralized error mapping utility to ensure consistent error handling
      throw mapAnyErrorToMcpError(errorWithContext, GEMINI_SEND_MESSAGE_TOOL_NAME);
    }
  };

  // Register the tool
  server.tool(
    GEMINI_SEND_MESSAGE_TOOL_NAME,
    GEMINI_SEND_MESSAGE_TOOL_DESCRIPTION,
    GEMINI_SEND_MESSAGE_PARAMS,
    processRequest
  );

  logger.info(`Tool registered: ${GEMINI_SEND_MESSAGE_TOOL_NAME}`);
};
