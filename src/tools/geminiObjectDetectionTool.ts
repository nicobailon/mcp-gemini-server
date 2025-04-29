import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GeminiService } from "../services/index.js";
import { ToolError } from "../utils/index.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import {
  GEMINI_OBJECT_DETECTION_PARAMS,
  GeminiObjectDetectionArgs,
  TOOL_NAME_OBJECT_DETECTION,
  TOOL_DESCRIPTION_OBJECT_DETECTION,
} from "./geminiObjectDetectionParams.js";
import { Part } from "@google/genai";
import { TypeOf } from "zod";
import { logger } from "../utils/index.js";

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
 * Tool for detecting objects and their locations in images using Gemini models.
 * @param server - The MCP server instance.
 * @param serviceInstance - Instance of the GeminiService.
 */
export function geminiObjectDetectionTool(
  server: McpServer
) {
  // Get the GeminiService instance
  const serviceInstance = require("../services/index.js").GeminiService.getInstance();
  const toolName = TOOL_NAME_OBJECT_DETECTION;
  const toolDescription = TOOL_DESCRIPTION_OBJECT_DETECTION;

  /**
   * Handles the conversion of input parameters into proper Gemini SDK formats and calls the service.
   * @param args - Arguments for object detection.
   */
  async function processRequest(args: GeminiObjectDetectionArgs): Promise<{content: Array<{type: 'text', text: string}>}> {
    try {
      // Validate args against schema
      try {
        // Validate with the PARAMS schema configuration
        const validArgs = (GEMINI_OBJECT_DETECTION_PARAMS as any)._parseSync(
          args
        );
        args = validArgs as GeminiObjectDetectionArgs;
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

      // Call the service with converted image part
      const result = await serviceInstance.detectObjects(
        imagePart,
        args.promptAddition,
        args.modelName,
        args.safetySettings
      );

      // Return in the format expected by McpServer
      if (args.outputFormat === "text" && result.rawText) {
        // For text format
        return {
          content: [
            {
              type: "text",
              text: result.rawText
            }
          ]
        };
      } else {
        // For JSON format
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.objects, null, 2)
            }
          ]
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
        // Generic error case
        throw new ToolError("Object detection failed", {
          code: "PROCESSING_ERROR",
          details: error.message,
        });
      }
      // Handle completely unknown errors
      throw new ToolError("Unknown error during object detection", {
        code: "UNKNOWN_ERROR",
        details: String(error),
      });
    }
  }

  // Register the tool with the server
  server.tool(
    toolName,
    toolDescription,
    GEMINI_OBJECT_DETECTION_PARAMS.shape, // Use the shape property of the zod object
    processRequest
  );

  // Return the tool config (optional, for testing/verification)
  return {
    name: toolName,
    description: toolDescription,
    parameters: GEMINI_OBJECT_DETECTION_PARAMS,
    processRequest,
  };
}
