import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
// We don't need to import z here, it's imported via the params file
import {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  TOOL_PARAMS,
  WriteToFileParams,
  writeToFileSchema,
} from "./writeToFileToolParams.js";
import { secureWriteFile } from "../utils/fileUtils.js";
import { logger } from "../utils/logger.js";
import { ConfigurationManager } from "../config/ConfigurationManager.js";

/**
 * Registers the writeToFile tool with the MCP server.
 * @param server - The McpServer instance.
 */
export const writeToFileTool = (server: McpServer): void => {
  /**
   * Process a write to file request.
   * @param args - The parameters for the file write operation.
   * @returns A response object containing a success message.
   * @throws McpError if the operation fails.
   */
  const processWriteRequest = async (args: unknown) => {
    // Validate and parse the arguments
    const validatedArgs = writeToFileSchema.parse(args);
    logger.debug(
      `Received write file request with args: ${JSON.stringify(validatedArgs)}`
    );

    try {
      // Get allowed paths from configuration
      const allowedOutputPaths =
        ConfigurationManager.getInstance().getAllowedOutputPaths();

      // Check if there are any allowed paths configured
      if (!allowedOutputPaths || allowedOutputPaths.length === 0) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          "No allowed output paths configured. Cannot write file."
        );
      }

      // Handle base64 encoding if specified
      let contentToWrite = validatedArgs.content;
      if (validatedArgs.encoding === "base64") {
        try {
          contentToWrite = Buffer.from(
            validatedArgs.content,
            "base64"
          ).toString("utf8");
        } catch (e) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Invalid base64 content."
          );
        }
      }

      // Write the file securely with overwrite=false by default
      await secureWriteFile(
        validatedArgs.filePath,
        contentToWrite,
        allowedOutputPaths,
        false // Do not overwrite existing files by default
      );

      // Return success response
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                message: "Content written to file successfully.",
                filePath: validatedArgs.filePath,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error(`Error writing file: ${error}`);

      // Handle specific errors
      if (error instanceof McpError) {
        throw error; // Re-throw if it's already an McpError
      }

      // Map different error types to appropriate MCP errors
      if (
        error instanceof Error &&
        error.message.includes("not within the allowed output")
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Security error: ${error.message}`
        );
      }

      if (
        error instanceof Error &&
        error.message.includes("File already exists")
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `File already exists: ${error.message}`
        );
      }

      // Catch-all for unexpected errors
      throw new McpError(
        ErrorCode.InternalError,
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while writing to file."
      );
    }
  };

  // Register the tool with the server
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, TOOL_PARAMS, processWriteRequest);

  logger.info(`Tool registered: ${TOOL_NAME}`);
};
