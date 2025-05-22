import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GeminiService } from "../services/index.js";
import { GeminiApiError, ToolError } from "../utils/index.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import {
  GEMINI_CONTENT_UNDERSTANDING_PARAMS,
  GeminiContentUnderstandingArgs,
  TOOL_NAME_CONTENT_UNDERSTANDING,
  TOOL_DESCRIPTION_CONTENT_UNDERSTANDING,
} from "./geminiContentUnderstandingParams.js";
import { Part } from "@google/genai";
import { TypeOf } from "zod";
import { logger } from "../utils/index.js";
import { ImagePart, SafetySetting } from "../services/gemini/GeminiTypes.js";

// Utility function to efficiently handle large base64 strings
async function* streamBase64Data(
  base64String: string,
  chunkSize = 1024 * 1024
) {
  // First validate base64 format quickly
  if (!/^data:.*?;base64,/.test(base64String)) {
    throw new Error("Invalid base64 data URL format");
  }

  // Split data header and content
  const [header, content] = base64String.split(",");

  // Calculate total chunks needed
  const totalChunks = Math.ceil(content.length / chunkSize);
  let processedChunks = 0;

  // Stream the data in chunks
  for (let i = 0; i < content.length; i += chunkSize) {
    const chunk = content.slice(i, i + chunkSize);
    processedChunks++;

    // Log progress for large files
    if (processedChunks % 10 === 0 || processedChunks === totalChunks) {
      logger.debug(
        `Processing base64 data: ${processedChunks}/${totalChunks} chunks`
      );
    }

    yield chunk;
  }
}

/**
 * Tool for analyzing and extracting information from visual content like charts and diagrams.
 * @param server - The MCP server instance.
 * @param serviceInstance - Instance of the GeminiService.
 */
export function geminiContentUnderstandingTool(server: McpServer) {
  // Get the GeminiService instance
  const serviceInstance = new GeminiService();
  const toolName = TOOL_NAME_CONTENT_UNDERSTANDING;
  const toolDescription = TOOL_DESCRIPTION_CONTENT_UNDERSTANDING;

  /**
   * Handles the conversion of input parameters into proper Gemini SDK formats and calls the service.
   * @param args - Arguments for content analysis.
   */
  async function processRequest(
    args: GeminiContentUnderstandingArgs
  ): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    try {
      // Validate args against schema
      try {
        // Validate with the PARAMS schema configuration
        const validArgs = (
          GEMINI_CONTENT_UNDERSTANDING_PARAMS as any
        )._parseSync(args);
        args = validArgs as GeminiContentUnderstandingArgs;
      } catch (validationError: any) {
        throw new ToolError("Invalid arguments", {
          details: validationError.errors,
          code: "INVALID_ARGUMENTS",
        });
      }

      // Convert image input to Part object based on type
      let imagePart: Part & { inlineData?: { data: string; mimeType: string } };
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
        // Handle base64 type with streaming for large files
        else {
          if (!args.image.mimeType) {
            throw new Error("mimeType is required for base64 image input");
          }

          // Calculate base64 size
          const sizeInBytes = Math.round((args.image.data.length * 3) / 4);
          const isLargeFile = sizeInBytes > 5 * 1024 * 1024; // 5MB threshold

          if (isLargeFile) {
            // Process large base64 files in chunks
            logger.debug("Processing large base64 image in chunks");
            let processedData = "";
            for await (const chunk of streamBase64Data(args.image.data)) {
              processedData += chunk;
            }
            imagePart = {
              inlineData: {
                data: processedData,
                mimeType: args.image.mimeType,
              },
            };
          } else {
            // Small files can be processed directly
            imagePart = {
              inlineData: {
                data: args.image.data,
                mimeType: args.image.mimeType,
              },
            };
          }
        }
      } catch (conversionError: any) {
        throw new ToolError("Failed to process image input", {
          details: conversionError.message,
          code: "IMAGE_PROCESSING_ERROR",
        });
      }

      // Call the service with the converted image part and other args
      const result = await serviceInstance.analyzeContent(
        imagePart as ImagePart,
        args.prompt,
        args.structuredOutput,
        args.modelName,
        args.safetySettings as SafetySetting[]
      );

      // Return in the format expected by McpServer
      if (args.structuredOutput && result.analysis.data) {
        // For structured data
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.analysis.data, null, 2),
            },
          ],
        };
      } else if (result.analysis.text) {
        // For plain text
        return {
          content: [
            {
              type: "text",
              text: result.analysis.text,
            },
          ],
        };
      } else {
        // Fallback
        return {
          content: [
            {
              type: "text",
              text: "Analysis completed. No textual content to display.",
            },
          ],
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
  server.tool(
    toolName,
    toolDescription,
    GEMINI_CONTENT_UNDERSTANDING_PARAMS.shape, // Use the shape property of the zod object
    processRequest
  );

  // Return the tool config (optional, for testing/verification)
  return {
    name: toolName,
    description: toolDescription,
    parameters: GEMINI_CONTENT_UNDERSTANDING_PARAMS,
    processRequest,
  };
}
