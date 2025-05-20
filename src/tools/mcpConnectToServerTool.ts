import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  TOOL_PARAMS,
  McpConnectToServerParams,
} from "./mcpConnectToServerToolParams.js";
import { McpClientService } from "../services/index.js";
import { logger } from "../utils/index.js";
import { ConfigurationManager } from "../config/ConfigurationManager.js";

/**
 * Registers the mcpConnectToServerTool with the MCP server.
 * @param server - The McpServer instance.
 * @param mcpClientService - The McpClientService instance for making connections.
 */
export const mcpConnectToServerTool = (
  server: McpServer,
  mcpClientService: McpClientService
): void => {
  // Define the async function that handles the tool execution
  const processConnectRequest = async (args: McpConnectToServerParams) => {
    logger.debug(
      `Received MCP connect request with args: ${JSON.stringify(args)}`
    );
    try {
      // Get the MCP config for default values
      const mcpConfig = ConfigurationManager.getInstance().getMcpConfig();

      // Extract transport and connection details
      const { transport, connectionDetails } = args;

      // Get clientId and connectionToken from args or config
      const clientId = connectionDetails.clientId || mcpConfig.clientId;
      const connectionToken =
        connectionDetails.connectionToken || mcpConfig.connectionToken;

      // Log the connection attempt with the selected client ID
      logger.info(
        `Establishing MCP connection using ${transport} transport with client ID: ${clientId}`
      );

      let connectionId: string;

      // Process based on transport type
      if (transport === "stdio") {
        // Type assertion to access stdio-specific fields
        const stdioDetails = connectionDetails as {
          transport: "stdio";
          command: string;
          args?: string[];
          clientId?: string;
          connectionToken?: string;
        };

        const { command, args: cmdArgs = [] } = stdioDetails;

        // Log the connection details (without sensitive information)
        logger.debug(
          `Connecting to MCP server via stdio using command: ${command} with args: [${cmdArgs.join(", ")}]`
        );
        logger.debug(`Using clientId: ${clientId}`);

        // Connect to the stdio server
        // Note: clientId and connectionToken are logged for now as the current API doesn't support passing them directly
        connectionId = await mcpClientService.connectStdio(command, cmdArgs);
      } else {
        // transport === "sse"
        // Type assertion to access sse-specific fields
        const sseDetails = connectionDetails as {
          transport: "sse";
          url: string;
          clientId?: string;
          connectionToken?: string;
        };

        const { url } = sseDetails;

        // Log the connection details (without sensitive information)
        logger.debug(`Connecting to MCP server via SSE at URL: ${url}`);
        logger.debug(`Using clientId: ${clientId}`);

        // Connect to the SSE server
        // Note: clientId and connectionToken are logged for now as the current API doesn't support passing them directly
        connectionId = await mcpClientService.connectSse(url);
      }

      // Format the successful output for MCP
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ connectionId }, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error(`Error establishing MCP connection: ${error}`);

      // Map errors to McpError
      if (error instanceof McpError) {
        throw error; // Re-throw if it's already an McpError
      }

      // Catch-all for unexpected errors
      throw new McpError(
        ErrorCode.InternalError,
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while establishing MCP connection."
      );
    }
  };

  // Register the tool with the server
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, TOOL_PARAMS, processConnectRequest);

  logger.info(`Tool registered: ${TOOL_NAME}`);
};
