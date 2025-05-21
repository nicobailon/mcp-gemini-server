import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { ConfigurationManager } from "../config/ConfigurationManager.js";
import { McpClientService } from "../services/mcp/McpClientService.js";
import { logger } from "../utils/logger.js";
import { secureWriteFile } from "../utils/fileUtils.js";
import {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  TOOL_PARAMS,
  McpCallServerToolParams,
} from "./mcpCallServerToolParams.js";

/**
 * Registers the mcpCallServerTool tool with the MCP server.
 * This tool allows calling tools on a connected MCP server and optionally
 * writing the results to a file.
 *
 * @param server - The MCP server instance
 * @param mcpClientService - The MCP client service instance
 */
export function mcpCallServerTool(
  server: McpServer,
  mcpClientService: McpClientService
): void {
  logger.info(`Registering tool: ${TOOL_NAME}`);

  // Create a schema object for tool registration
  const toolParamsObject = z.object(TOOL_PARAMS);

  /**
   * Process a remote MCP tool call request
   *
   * @param args - The validated tool parameters
   * @returns The tool's response
   */
  async function processCallToolRequest(
    args: McpCallServerToolParams
  ): Promise<{
    content: Array<{
      type: string;
      text: string;
    }>;
  }> {
    logger.info(
      `Calling remote tool ${args.toolName} on connection ${args.connectionId}`
    );

    try {
      // Call the remote tool using the MCP client service
      const result = await mcpClientService.callTool(
        args.connectionId,
        args.toolName,
        args.toolParameters
      );

      // If an output file path is specified, write the result to the file
      if (args.outputFilePath) {
        try {
          // Get allowed output paths from the configuration
          const allowedOutputPaths =
            ConfigurationManager.getInstance().getAllowedOutputPaths();

          if (!allowedOutputPaths || allowedOutputPaths.length === 0) {
            throw new Error(
              "No allowed output paths configured. Set the " +
                "ALLOWED_OUTPUT_PATHS environment variable."
            );
          }

          // Use the overwriteFile parameter (defaults to true if not specified)
          await secureWriteFile(
            args.outputFilePath,
            JSON.stringify(result, null, 2),
            allowedOutputPaths,
            args.overwriteFile !== undefined ? args.overwriteFile : true
          );

          // Return a success message with the file path
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    message: "Output written to file",
                    filePath: args.outputFilePath,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          logger.error(
            `Error writing result to file: ${
              error instanceof Error ? error.message : String(error)
            }`,
            error
          );

          // Specific handling for different error types
          if (
            error instanceof Error &&
            (error.message.includes("not within the allowed output") ||
              error.message.includes("Security error:"))
          ) {
            throw new McpError(
              ErrorCode.SecurityViolation,
              `Security error: ${error.message}`,
              { path: args.outputFilePath }
            );
          } else if (
            error instanceof Error &&
            error.message.includes("File already exists")
          ) {
            throw new McpError(ErrorCode.InvalidParams, `${error.message}`, {
              path: args.outputFilePath,
              overwrite: args.overwriteFile,
            });
          } else {
            throw new McpError(
              ErrorCode.FileSystemError,
              `Failed to write output to file: ${
                error instanceof Error ? error.message : String(error)
              }`,
              { path: args.outputFilePath }
            );
          }
        }
      }

      // If no output file path is specified, return the result directly
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error(
        `Error calling remote tool ${args.toolName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error
      );

      // Handle specific error types based on error messages
      if (error instanceof McpError) {
        // Pass through MCP errors but add additional context for better debugging
        throw new McpError(error.code, error.message, {
          ...error.data,
          toolName: args.toolName,
          connectionId: args.connectionId,
        });
      } else if (
        error instanceof Error &&
        error.message &&
        error.message.includes("No connection found")
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid connection ID: ${args.connectionId}`,
          { connectionId: args.connectionId }
        );
      } else if (
        error instanceof Error &&
        error.message &&
        error.message.includes("HTTP error")
      ) {
        throw new McpError(
          ErrorCode.NetworkError,
          `Network error while calling tool ${args.toolName}: ${error.message}`,
          { toolName: args.toolName, connectionId: args.connectionId }
        );
      } else if (
        error instanceof Error &&
        error.message &&
        error.message.includes("timeout")
      ) {
        throw new McpError(
          ErrorCode.Timeout,
          `Timeout while calling tool ${args.toolName}: ${error.message}`,
          { toolName: args.toolName, connectionId: args.connectionId }
        );
      } else {
        // Generic error case
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to call remote tool ${args.toolName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { toolName: args.toolName, connectionId: args.connectionId }
        );
      }
    }
  }

  // Register the tool with the MCP server
  server.tool(
    TOOL_NAME,
    TOOL_DESCRIPTION,
    toolParamsObject,
    processCallToolRequest
  );

  logger.info(`Tool registered: ${TOOL_NAME}`);
}
