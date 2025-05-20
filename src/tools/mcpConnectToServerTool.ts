import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  TOOL_PARAMS,
  McpConnectToServerParams,
} from "./mcpConnectToServerToolParams.js";
import { McpClientService, ConnectionDetails } from "../services/index.js";
import { logger } from "../utils/index.js";
import { ConfigurationManager } from "../config/ConfigurationManager.js";
import { v4 as uuidv4 } from "uuid";

// Define the specific connection detail types based on the Zod schemas
interface StdioConnectionDetails {
  transport: "stdio";
  command: string;
  args?: string[];
  clientId?: string;
  connectionToken?: string;
}

interface SseConnectionDetails {
  transport: "sse";
  url: string;
  clientId?: string;
  connectionToken?: string;
}

// Union type for the connection details
type TransportConnectionDetails = StdioConnectionDetails | SseConnectionDetails;

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

      // Get clientId from args or config
      const clientId = connectionDetails.clientId || mcpConfig.clientId;

      // Log the connection attempt with the selected client ID
      logger.info(
        `Establishing MCP connection using ${transport} transport with client ID: ${clientId}`
      );

      // Create a unique server ID for this connection
      const serverId = uuidv4();

      // Cast the connectionDetails to the proper type based on transport
      const typedConnectionDetails =
        connectionDetails as TransportConnectionDetails;

      // Prepare connection details object according to the ConnectionDetails interface
      const connectionDetailsObject: ConnectionDetails = {
        type: transport,
        ...(transport === "stdio"
          ? {
              stdioCommand: (typedConnectionDetails as StdioConnectionDetails)
                .command,
              stdioArgs:
                (typedConnectionDetails as StdioConnectionDetails).args || [],
            }
          : {
              sseUrl: (typedConnectionDetails as SseConnectionDetails).url,
            }),
      };

      // Connect to the server using the public connect method
      const connectionId = await mcpClientService.connect(
        serverId,
        connectionDetailsObject
      );

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
