import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  TOOL_PARAMS,
  McpDisconnectFromServerParams,
} from "./mcpDisconnectFromServerToolParams.js";
import { McpClientService } from "../services/index.js";
import { logger } from "../utils/index.js";

/**
 * Registers the mcpDisconnectFromServerTool with the MCP server.
 * @param server - The McpServer instance.
 * @param mcpClientService - The McpClientService instance for managing connections.
 */
export const mcpDisconnectFromServerTool = (
  server: McpServer,
  mcpClientService: McpClientService
): void => {
  // Define the async function that handles the tool execution
  const processDisconnectRequest = async (
    args: McpDisconnectFromServerParams
  ) => {
    logger.debug(
      `Received MCP disconnect request with args: ${JSON.stringify(args)}`
    );
    try {
      // Check if the connection is an SSE connection
      const sseClosed = mcpClientService.closeSseConnection(args.connectionId);

      if (sseClosed) {
        logger.info(`SSE connection ${args.connectionId} closed successfully.`);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  message: "SSE Connection closed successfully.",
                  connectionId: args.connectionId,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // If not an SSE connection, try to close stdio connection
      const stdioClosed = mcpClientService.closeStdioConnection(
        args.connectionId
      );

      if (stdioClosed) {
        logger.info(
          `Stdio connection ${args.connectionId} closed successfully.`
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  message: "Stdio Connection closed successfully.",
                  connectionId: args.connectionId,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // If connection ID not found in either type
      throw new McpError(
        ErrorCode.InvalidParams,
        `No active connection found with ID: ${args.connectionId}`
      );
    } catch (error) {
      logger.error(`Error closing MCP connection: ${error}`);

      // Map errors to McpError
      if (error instanceof McpError) {
        throw error; // Re-throw if it's already an McpError
      }

      // Catch-all for unexpected errors
      throw new McpError(
        ErrorCode.InternalError,
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while closing MCP connection."
      );
    }
  };

  // Register the tool with the server
  server.tool(
    TOOL_NAME,
    TOOL_DESCRIPTION,
    TOOL_PARAMS,
    processDisconnectRequest
  );

  logger.info(`Tool registered: ${TOOL_NAME}`);
};
