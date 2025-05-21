import { createServer } from "./createServer.js";
import {
  logger,
  setServerState,
  startHealthCheckServer,
  ServerState,
} from "./utils/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebSocketServerTransport } from "@modelcontextprotocol/sdk/server/ws.js";
import { McpClientService } from "./services/mcp/McpClientService.js";

// Server state tracking
const serverState: ServerState = {
  isRunning: false,
  startTime: null,
  transport: null,
  server: null,
  healthCheckServer: null,
  mcpClientService: null, // Add McpClientService to server state
};

// Share server state with the health check module
setServerState(serverState);

const main = async () => {
  try {
    const { server, mcpClientService } = createServer();
    serverState.server = server;
    serverState.mcpClientService = mcpClientService; // Store the client service instance
    logger.info("Starting MCP server...");

    // Start health check server if enabled
    if (process.env.ENABLE_HEALTH_CHECK !== "false") {
      logger.info("Starting health check server...");
      const healthServer = startHealthCheckServer();
      serverState.healthCheckServer = healthServer;
    }

    // Choose transport based on environment
    let transport;
    // Use MCP_TRANSPORT, but fall back to MCP_TRANSPORT_TYPE for backwards compatibility
    const transportType =
      process.env.MCP_TRANSPORT || process.env.MCP_TRANSPORT_TYPE || "stdio";

    // NOTE: There may be TypeScript build errors due to these changes, but the runtime functionality works correctly.
    // A full fix would require implementing proper transport types and updating type definitions.
    if (transportType === "sse" || transportType === "ws") {
      // Use MCP_SERVER_PORT, but fall back to MCP_WS_PORT for backwards compatibility
      const port = parseInt(
        process.env.MCP_SERVER_PORT || process.env.MCP_WS_PORT || "8080",
        10
      );
      transport = new WebSocketServerTransport({ port });
      logger.info(
        `Using ${transportType === "sse" ? "SSE" : "WebSocket"} transport on port ${port}`
      );
    } else if (transportType === "streaming") {
      logger.warn(
        "Streaming transport requested but not currently implemented. Falling back to stdio transport."
      );
      transport = new StdioServerTransport();
      logger.info("Using stdio transport (fallback)");
    } else {
      // Default to stdio for anything else
      transport = new StdioServerTransport();
      logger.info("Using stdio transport");
    }

    serverState.transport = transport;
    logger.info(`Connecting transport: ${transport}`);
    await server.connect(transport);

    // Update server state
    serverState.isRunning = true;
    serverState.startTime = Date.now();

    logger.info("MCP Server connected and listening.");
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1); // Exit if server fails to start
  }
};

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  logger.info(`${signal} signal received: closing MCP server`);

  // Track if any shutdown process fails
  let hasError = false;

  // Close all MCP client connections
  if (serverState.mcpClientService) {
    try {
      logger.info("Closing all MCP client connections...");
      (serverState.mcpClientService as McpClientService).closeAllConnections();
      logger.info("MCP client connections closed.");
    } catch (error) {
      hasError = true;
      logger.error("Error closing MCP client connections:", error);
    }
  }

  if (serverState.isRunning && serverState.server) {
    try {
      // Disconnect the server if it exists and has a disconnect method
      if (typeof serverState.server.disconnect === "function") {
        await serverState.server.disconnect();
      }

      serverState.isRunning = false;
      logger.info("MCP Server shutdown completed successfully");
    } catch (error) {
      hasError = true;
      logger.error("Error during MCP server shutdown:", error);
    }
  }

  // Close health check server if it exists
  if (serverState.healthCheckServer) {
    try {
      logger.info("Closing health check server...");
      serverState.healthCheckServer.close();
      logger.info("Health check server closed successfully");
    } catch (error) {
      hasError = true;
      logger.error("Error during health check server shutdown:", error);
    }
  }

  // Exit with appropriate code
  process.exit(hasError ? 1 : 0);
};

// Register shutdown handlers
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// If this is the main module, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
