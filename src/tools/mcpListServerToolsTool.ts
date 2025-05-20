import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  TOOL_PARAMS,
  McpListServerToolsParams,
} from "./mcpListServerToolsToolParams.js";
import { McpClientService } from "../services/index.js";
import { logger } from "../utils/index.js";

/**
 * Registers the mcpListServerToolsTool with the MCP server.
 * @param server - The McpServer instance.
 * @param mcpClientService - The McpClientService instance for accessing MCP connections.
 */
export const mcpListServerToolsTool = (
  server: McpServer,
  mcpClientService: McpClientService
): void => {
  // Define the async function that handles the tool execution
  const processListToolsRequest = async (args: McpListServerToolsParams) => {
    logger.debug(
      `Received MCP list tools request with args: ${JSON.stringify(args)}`
    );
    try {
      // Extract connection ID
      const { connectionId } = args;

      // Log the list tools attempt
      logger.info(
        `Listing available tools for MCP connection: ${connectionId}`
      );

      // Request tool list from the MCP server
      const toolList = await mcpClientService.listTools(connectionId);

      // Format the successful output for MCP
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(toolList, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error(`Error listing MCP server tools: ${error}`);

      // Map errors to McpError
      if (error instanceof McpError) {
        throw error; // Re-throw if it's already an McpError
      }

      // If error message indicates invalid connection ID
      if (
        error instanceof Error &&
        error.message.includes("No connection found with ID")
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid or non-existent connection ID: ${args.connectionId}`
        );
      }

      // Catch-all for unexpected errors
      throw new McpError(
        ErrorCode.InternalError,
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while listing MCP server tools."
      );
    }
  };

  // Create a proper schema object for registration
  const paramsSchema = z.object(TOOL_PARAMS);

  // Register the tool with the server
  server.tool(
    TOOL_NAME,
    TOOL_DESCRIPTION,
    paramsSchema,
    processListToolsRequest
  );

  logger.info(`Tool registered: ${TOOL_NAME}`);
};
