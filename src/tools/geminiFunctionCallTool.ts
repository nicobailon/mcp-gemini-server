import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  GEMINI_FUNCTION_CALL_TOOL_NAME,
  GEMINI_FUNCTION_CALL_TOOL_DESCRIPTION,
  GEMINI_FUNCTION_CALL_PARAMS,
} from "./geminiFunctionCallParams.js";
import { GeminiService } from "../services/index.js";
import { GeminiServiceConfig } from "../types/index.js";
import { logger } from "../utils/index.js";
import { GeminiApiError, mapAnyErrorToMcpError } from "../utils/errors.js"; // Import mapAnyErrorToMcpError
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

      // Call the service method with the new parameter object format
      // Using generateContent since generateFunctionCallRequest doesn't exist
      // Prepare parameters object without invalid properties
      const contentParams: any = {
        prompt,
        modelName,
      };
      
      // Only add valid properties to avoid TypeScript errors
      if (functionDeclarations) contentParams.functionDeclarations = functionDeclarations;
      if (generationConfig) contentParams.generationConfig = generationConfig;
      if (safetySettings) contentParams.safetySettings = safetySettings;
      if (toolConfig) contentParams.toolConfig = toolConfig;
      
      const result = await serviceInstance.generateContent(contentParams);

      // Check if result is a string or an object with a function call
      if (typeof result === 'object' && result !== null) {
        // It's an object response, could be a function call
        const resultObj = result as any; // Cast to any to access properties
        
        if (resultObj.functionCall && typeof resultObj.functionCall === 'object') {
          // It's a function call request
          logger.debug(
            `Function call requested by model ${modelName}: ${resultObj.functionCall.name}`
          );
          // Serialize the function call details into a JSON string
          const functionCallJson = JSON.stringify(resultObj.functionCall);
          return {
            content: [
              {
                type: "text" as const, // Return as text type
                text: functionCallJson, // Embed JSON string in text field
              },
            ],
          };
        } else if (resultObj.text && typeof resultObj.text === 'string') {
          // It's a regular text response
          logger.debug(
            `Text response received from function call request for model ${modelName}.`
          );
          return {
            content: [
              {
                type: "text" as const,
                text: resultObj.text,
              },
            ],
          };
        }
      }
      
      // If we get here, it's likely a plain string response
      if (typeof result === 'string') {
        return {
          content: [
            {
              type: "text" as const,
              text: result,
            },
          ],
        };
      } else {
        // Unexpected response structure from the service
        logger.error(
          `Unexpected response structure from generateContent for model ${modelName}:`,
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
      
      // Use the centralized error mapping utility to ensure consistent error handling
      throw mapAnyErrorToMcpError(error, GEMINI_FUNCTION_CALL_TOOL_NAME);
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
