import { McpServer } from "../server/mcp";
import { GeminiService } from "../services/GeminiService";
import { McpError, ToolError } from "../utils/errors";
import {
  GEMINI_CONTENT_UNDERSTANDING_PARAMS,
  GeminiContentUnderstandingArgs,
  TOOL_NAME_CONTENT_UNDERSTANDING,
  TOOL_DESCRIPTION_CONTENT_UNDERSTANDING,
} from "./geminiContentUnderstandingParams";
import { Part } from "@google/genai";
import { TypeOf } from "zod";
import { logger } from "../utils/index.js";

/**
 * Tool for analyzing and extracting information from visual content like charts and diagrams.
 * @param server - The MCP server instance.
 * @param serviceInstance - Instance of the GeminiService.
 */
export function geminiContentUnderstandingTool(
  server: McpServer,
  serviceInstance: GeminiService
) {
  const toolName = TOOL_NAME_CONTENT_UNDERSTANDING;
  const toolDescription = TOOL_DESCRIPTION_CONTENT_UNDERSTANDING;

  /**
   * Handles the conversion of input parameters into proper Gemini SDK formats and calls the service.
   * @param args - Arguments for content analysis.
   */
  async function processRequest(args: GeminiContentUnderstandingArgs) {
    try {
      // Validate args against schema
      try {
        // Validate with the PARAMS schema configuration
        const validArgs = (GEMINI_CONTENT_UNDERSTANDING_PARAMS as any)._parseSync(args);
        args = validArgs as GeminiContentUnderstandingArgs;
      } catch (validationError: any) {
        throw new ToolError("Invalid arguments", {
          details: validationError.errors,
          code: "INVALID_ARGUMENTS",
        });
      }

      // Convert image input to Part object based on type
      let imagePart: Part;
      try {
        // Handle URL type
        if (args.image.type === "url") {
          imagePart = {
            fileData: {
              fileUri: args.image.data,
              mimeType: args.image.mimeType || "application/octet-stream",
            },
          };
        }
        // Handle base64 type
        else {
          if (!args.image.mimeType) {
            throw new Error("mimeType is required for base64 image input");
          }
          imagePart = {
            inlineData: {
              data: args.image.data,
              mimeType: args.image.mimeType,
            },
          };
        }
      } catch (conversionError: any) {
        throw new ToolError("Failed to process image input", {
          details: conversionError.message,
          code: "IMAGE_PROCESSING_ERROR",
        });
      }

      // Call the service with the converted image part and other args
      const result = await serviceInstance.analyzeContent(
        imagePart,
        args.prompt,
        args.structuredOutput,
        args.modelName,
        args.safetySettings
      );

      // Return either JSON or text format based on what we got from the service
      if (args.structuredOutput && result.analysis.data) {
        return {
          response: result,
          format: "application/json",
        };
      } else {
        return {
          response: result,
          format: "text/plain",
        };
      }
    } catch (error: unknown) {
      // Handle specific errors from the service
      if (error instanceof McpError) {
        throw error; // Re-throw MCP-specific errors directly
      }

      // Map other errors to appropriate MCP errors
      logger.error(`Error in ${toolName}:`, error);
      if (error instanceof Error) {
        // Map common error cases
        if (error.message.includes("safety settings")) {
          throw new ToolError("Content blocked by safety settings", {
            code: "SAFETY_ERROR",
            details: error.message,
          });
        }
        if (error.message.includes("INVALID_ARGUMENT")) {
          throw new ToolError("Invalid request parameters", {
            code: "INVALID_ARGUMENTS",
            details: error.message,
          });
        }
        if (error.message.includes("process image")) {
          throw new ToolError("Image processing failed", {
            code: "IMAGE_PROCESSING_ERROR",
            details: error.message,
          });
        }
        if (error.message.includes("Failed to parse JSON")) {
          throw new ToolError("Failed to parse structured output", {
            code: "JSON_PARSING_ERROR",
            details: error.message,
          });
        }
        // Generic error case
        throw new ToolError("Content analysis failed", {
          code: "PROCESSING_ERROR",
          details: error.message,
        });
      }
      // Handle completely unknown errors
      throw new ToolError("Unknown error during content analysis", {
        code: "UNKNOWN_ERROR",
        details: String(error),
      });
    }
  }

  // Register the tool with the server
  server.tools.register({
    name: toolName,
    description: toolDescription,
    parameters: GEMINI_CONTENT_UNDERSTANDING_PARAMS,
    func: processRequest,
  });

  // Return the tool config (optional, for testing/verification)
  return {
    name: toolName,
    description: toolDescription,
    parameters: GEMINI_CONTENT_UNDERSTANDING_PARAMS,
    processRequest,
  };
}
