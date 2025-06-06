import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  GEMINI_SEND_FUNCTION_RESULT_TOOL_NAME,
  GEMINI_SEND_FUNCTION_RESULT_TOOL_DESCRIPTION,
  GEMINI_SEND_FUNCTION_RESULT_PARAMS,
  GeminiSendFunctionResultArgs, // Import the type helper
} from "./geminiSendFunctionResultParams.js";
import { GeminiService } from "../services/index.js";
import { GeminiServiceConfig } from "../types/index.js";
import { logger } from "../utils/index.js";
import { GeminiApiError, mapAnyErrorToMcpError } from "../utils/errors.js";
// Import SDK types used in parameters/response handling
import { BlockedReason, FinishReason } from "@google/genai"; // Import enums as values
import type {
  GenerationConfig,
  SafetySetting,
  GenerateContentResponse,
  FunctionCall,
} from "@google/genai";

/**
 * Registers the gemini_sendFunctionResult tool with the MCP server.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiSendFunctionResultTool = (
  server: McpServer,
  serviceInstance: GeminiService
): void => {
  // Service instance is now passed in.

  /**
   * Processes the request for the gemini_sendFunctionResult tool.
   * @param args - The arguments object matching GEMINI_SEND_FUNCTION_RESULT_PARAMS.
   * @returns The result containing the model's subsequent response.
   */
  const processRequest = async (
    args: GeminiSendFunctionResultArgs
  ): Promise<CallToolResult> => {
    logger.debug(
      `Received ${GEMINI_SEND_FUNCTION_RESULT_TOOL_NAME} request for session: ${args.sessionId}`
    );
    try {
      const { sessionId, functionResponses, generationConfig, safetySettings } =
        args;

      // Call the service to send the function results with the new parameter object format
      const response: GenerateContentResponse =
        await serviceInstance.sendFunctionResultToSession({
          sessionId,
          functionResponse: functionResponses
            ? JSON.stringify(functionResponses)
            : "{}",
          functionCall: undefined, // In future, may support passing the original function call for reference
        });

      // --- Process the SDK Response into MCP Format (Similar to sendMessageTool) ---

      // Check for prompt safety blocks first (less likely here, but good practice)
      if (response.promptFeedback?.blockReason === BlockedReason.SAFETY) {
        logger.warn(
          `Gemini prompt blocked due to SAFETY for session ${sessionId} after function result.`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: Prompt blocked due to safety settings after function result. Reason: ${response.promptFeedback.blockReason}`,
            },
          ],
          isError: true,
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
            `Gemini response stopped due to SAFETY for session ${sessionId} after function result.`
          );
          return {
            content: [
              {
                type: "text",
                text: `Error: Response generation stopped due to safety settings after function result. FinishReason: ${firstCandidate.finishReason}`,
              },
            ],
            isError: true,
          };
        }
        logger.warn(
          `Gemini response finished with reason ${firstCandidate.finishReason} for session ${sessionId} after function result.`
        );
      }

      let subsequentFunctionCalls: FunctionCall[] | undefined;
      let responseText: string | undefined;

      // Extract subsequent function calls or text from the response parts
      if (firstCandidate?.content?.parts) {
        subsequentFunctionCalls = firstCandidate.content.parts
          .map((part) => part.functionCall)
          .filter((fc): fc is FunctionCall => !!fc);

        if (!subsequentFunctionCalls || subsequentFunctionCalls.length === 0) {
          responseText = firstCandidate.content.parts
            .filter((part) => typeof part.text === "string")
            .map((part) => part.text)
            .join("");
        }
      }

      // Format the MCP response content
      if (subsequentFunctionCalls && subsequentFunctionCalls.length > 0) {
        logger.debug(
          `Returning subsequent function call(s) for session ${sessionId}: ${subsequentFunctionCalls.map((fc) => fc.name).join(", ")}`
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ functionCalls: subsequentFunctionCalls }),
            },
          ],
        };
      } else if (responseText !== undefined) {
        logger.debug(
          `Returning text response for session ${sessionId} after function result.`
        );
        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      } else {
        logger.warn(
          `No text or subsequent function call found in Gemini response for session ${sessionId} after function result, finishReason: ${firstCandidate?.finishReason}. Returning empty content.`
        );
        return { content: [{ type: "text", text: "" }] };
      }
      // --- End Response Processing ---
    } catch (error: unknown) {
      logger.error(
        `Error processing ${GEMINI_SEND_FUNCTION_RESULT_TOOL_NAME} for session ${args.sessionId}:`,
        error
      );

      // Enhance error details with session ID for better debugging
      // Make a copy of the error to add session context before mapping
      // We can't modify the error.details directly since it's read-only,
      // but we can create a custom error object to pass to mapAnyErrorToMcpError
      let errorWithContext = error;
      if (error instanceof GeminiApiError && error.details) {
        // Create a new error object with the session context
        errorWithContext = new GeminiApiError(
          error.message,
          typeof error.details === "object"
            ? { ...(error.details as object), sessionId: args.sessionId }
            : { originalDetails: error.details, sessionId: args.sessionId }
        );
      }

      // Use the centralized error mapping utility to ensure consistent error handling
      throw mapAnyErrorToMcpError(
        errorWithContext,
        GEMINI_SEND_FUNCTION_RESULT_TOOL_NAME
      );
    }
  };

  // Register the tool
  server.tool(
    GEMINI_SEND_FUNCTION_RESULT_TOOL_NAME,
    GEMINI_SEND_FUNCTION_RESULT_TOOL_DESCRIPTION,
    GEMINI_SEND_FUNCTION_RESULT_PARAMS,
    processRequest
  );

  logger.info(`Tool registered: ${GEMINI_SEND_FUNCTION_RESULT_TOOL_NAME}`);
};
