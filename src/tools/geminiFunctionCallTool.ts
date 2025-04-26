import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  GEMINI_FUNCTION_CALL_TOOL_NAME,
  GEMINI_FUNCTION_CALL_TOOL_DESCRIPTION,
  GEMINI_FUNCTION_CALL_PARAMS,
} from "./geminiFunctionCallParams.js";
import { GeminiService } from "../services/index.js";
import { GeminiServiceConfig } from "../types/index.js";
import { logger } from "../utils/index.js";
import { GeminiApiError } from "../utils/errors.js"; // Import custom error
// Import SDK types used in parameters/service calls for type safety
import type {
  FunctionDeclaration,
  GenerationConfig,
  SafetySetting,
  ToolConfig,
} from "@google/genai";

// Define the type for the arguments object based on the Zod schema
type GeminiFunctionCallArgs = z.infer<
  z.ZodObject<typeof GEMINI_FUNCTION_CALL_PARAMS>
>;

/**
 * Registers the gemini_functionCall tool with the MCP server.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiFunctionCallTool = (
  server: McpServer,
  serviceInstance: GeminiService
): void => {
  // Service instance is now passed in.

  /**
   * Processes the request for the gemini_functionCall tool.
   * @param args - The arguments object matching GEMINI_FUNCTION_CALL_PARAMS.
   * @returns The result content for MCP (either function call details as JSON string in text, or plain text).
   */
  const processRequest = async (args: GeminiFunctionCallArgs) => {
    logger.debug(`Received ${GEMINI_FUNCTION_CALL_TOOL_NAME} request:`, {
      model: args.modelName,
    });
    try {
      const {
        modelName,
        prompt,
        functionDeclarations,
        generationConfig,
        safetySettings,
        toolConfig, // Extract toolConfig
      } = args;

      // Call the service method - Cast Zod inferred types to SDK types if necessary
      const result = await serviceInstance.generateFunctionCallRequest(
        prompt, // Correct order: prompt first
        functionDeclarations as FunctionDeclaration[], // Cast Zod array to SDK type array
        modelName, // modelName third (optional)
        generationConfig as GenerationConfig | undefined,
        safetySettings as SafetySetting[] | undefined,
        toolConfig as ToolConfig | undefined // Cast Zod object to SDK type
      );

      // Check the result structure to determine if it's a function call or text
      // Assuming the service returns an object like { functionCall: {...} } or { text: "..." }
      if (
        result &&
        result.functionCall &&
        typeof result.functionCall === "object"
      ) {
        // It's a function call request
        logger.debug(
          `Function call requested by model ${modelName}: ${result.functionCall.name}`
        );
        // Serialize the function call details into a JSON string
        const functionCallJson = JSON.stringify(result.functionCall);
        return {
          content: [
            {
              type: "text" as const, // Return as text type
              text: functionCallJson, // Embed JSON string in text field
            },
          ],
        };
      } else if (result && typeof result.text === "string") {
        // It's a regular text response
        logger.debug(
          `Text response received from function call request for model ${modelName}.`
        );
        return {
          content: [
            {
              type: "text" as const,
              text: result.text,
            },
          ],
        };
      } else {
        // Unexpected response structure from the service
        logger.error(
          `Unexpected response structure from generateFunctionCallRequest for model ${modelName}:`,
          result
        );
        throw new Error(
          "Invalid response structure received from Gemini service."
        );
      }
    } catch (error: unknown) {
      logger.error(
        `Error processing ${GEMINI_FUNCTION_CALL_TOOL_NAME}:`,
        error
      );

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
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred in the tool.";
      throw new McpError(
        ErrorCode.InternalError,
        `[${GEMINI_FUNCTION_CALL_TOOL_NAME}] Failed: ${errorMessage}`
      );
    }
  };

  // Register the tool with the server
  server.tool(
    GEMINI_FUNCTION_CALL_TOOL_NAME,
    GEMINI_FUNCTION_CALL_TOOL_DESCRIPTION,
    GEMINI_FUNCTION_CALL_PARAMS,
    processRequest
  );

  logger.info(`Tool registered: ${GEMINI_FUNCTION_CALL_TOOL_NAME}`);
};
