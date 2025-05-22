import { createServer } from "./createServer.js";
import {
  logger,
  setServerState,
  startHealthCheckServer,
  ServerState,
} from "./utils/index.js";
import type { JsonRpcInitializeRequest } from "./types/serverTypes.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// import { WebSocketServerTransport } from "@modelcontextprotocol/sdk/server/ws.js"; // Not available in SDK
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionService } from "./services/SessionService.js";
import express from "express";
import { randomUUID } from "node:crypto";
/**
 * Type guard to check if a value is a JSON-RPC 2.0 initialize request
 * @param value - The value to check
 * @returns true if the value matches the JSON-RPC initialize request structure
 */
const isInitializeRequest = (
  value: unknown
): value is JsonRpcInitializeRequest => {
  // Early exit for non-objects
  if (!value || typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required JSON-RPC 2.0 fields
  if (obj.jsonrpc !== "2.0") {
    return false;
  }

  if (obj.method !== "initialize") {
    return false;
  }

  // Check id exists and is string or number (per JSON-RPC spec)
  if (typeof obj.id !== "string" && typeof obj.id !== "number") {
    return false;
  }

  return true;
};

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

// Map to store transports by session ID for HTTP mode
const httpTransports: Record<string, StreamableHTTPServerTransport> = {};

/**
 * Sets up HTTP server for Streamable HTTP transport
 */
async function setupHttpServer(
  mcpServer: { connect: (transport: Transport) => Promise<void> },
  _sessionService: SessionService
): Promise<void> {
  const app = express();
  app.use(express.json());

  const port = parseInt(
    process.env.MCP_SERVER_PORT || process.env.MCP_WS_PORT || "8080",
    10
  );

  // CORS middleware
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Authorization, Mcp-Session-Id, Last-Event-ID"
    );
    if (req.method === "OPTIONS") {
      res.status(204).send();
      return;
    }
    next();
  });

  // MCP endpoint
  app.post("/mcp", async (req, res) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && httpTransports[sessionId]) {
        // Reuse existing transport
        transport = httpTransports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // Create new transport for initialization
        const sessionIdGenerator =
          process.env.MCP_ENABLE_STREAMING === "true"
            ? () => randomUUID()
            : undefined;

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator,
          onsessioninitialized: (sid: string) => {
            logger.info(`HTTP session initialized: ${sid}`);
            httpTransports[sid] = transport;
          },
        });

        // Set up cleanup handler
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && httpTransports[sid]) {
            logger.info(`HTTP transport closed for session ${sid}`);
            delete httpTransports[sid];
          }
        };

        // Connect transport to MCP server
        await mcpServer.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error("Error handling HTTP request:", error);
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal error",
        },
      });
    }
  });

  // GET endpoint for SSE streaming
  app.get("/mcp", async (req, res) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string;
      if (!sessionId || !httpTransports[sessionId]) {
        res.status(404).json({
          error: "Session not found",
        });
        return;
      }

      const transport = httpTransports[sessionId];
      await transport.handleRequest(req, res);
    } catch (error) {
      logger.error("Error handling GET request:", error);
      res.status(500).json({
        error: "Internal error",
      });
    }
  });

  // Start HTTP server
  const httpServer = app.listen(port, () => {
    logger.info(`HTTP server listening on port ${port} with /mcp endpoint`);
  });

  // Store HTTP server in state for cleanup
  serverState.httpServer = httpServer;
}

const main = async () => {
  try {
    const sessionService = new SessionService(
      parseInt(process.env.MCP_SESSION_TIMEOUT || "3600", 10)
    );

    const { server, mcpClientService } = createServer();
    serverState.server = server;
    // Type compatibility: McpClientService implements McpClientServiceLike interface
    // The actual service has all required methods (disconnect, closeAllConnections)
    serverState.mcpClientService = mcpClientService; // Store the client service instance
    serverState.sessionService = sessionService; // Store the session service instance
    logger.info("Starting MCP server...");

    // Start health check server if enabled
    if (process.env.ENABLE_HEALTH_CHECK !== "false") {
      logger.info("Starting health check server...");
      const healthServer = startHealthCheckServer();
      serverState.healthCheckServer = healthServer;
    }

    // Choose transport based on environment
    let transport: Transport | null;
    // Use MCP_TRANSPORT, but fall back to MCP_TRANSPORT_TYPE for backwards compatibility
    const transportType =
      process.env.MCP_TRANSPORT || process.env.MCP_TRANSPORT_TYPE || "stdio";

    if (transportType === "sse" || transportType === "ws") {
      // WebSocket transport is not available in the current SDK version
      const fallbackReason =
        "WebSocket/SSE transport not available in current SDK version";
      logger.warn("Transport fallback", {
        requested: transportType,
        selected: "stdio",
        fallback: true,
        reason: fallbackReason,
        timestamp: new Date().toISOString(),
      });
      transport = new StdioServerTransport();
      logger.info("Using stdio transport (fallback)");
    } else if (transportType === "http" || transportType === "streamable") {
      // For HTTP/Streamable transport, we don't need a persistent transport
      // Individual requests will create their own transports
      transport = null; // No persistent transport needed
      logger.info("Transport selected", {
        requested: transportType,
        selected: "streamable",
        fallback: false,
        message:
          "HTTP transport - individual requests will create their own transports",
        timestamp: new Date().toISOString(),
      });
    } else if (transportType === "streaming") {
      const fallbackReason = "Streaming transport not currently implemented";
      logger.warn("Transport fallback", {
        requested: transportType,
        selected: "stdio",
        fallback: true,
        reason: fallbackReason,
        timestamp: new Date().toISOString(),
      });
      transport = new StdioServerTransport();
      logger.info("Using stdio transport (fallback)");
    } else {
      // Default to stdio for anything else
      transport = new StdioServerTransport();
      logger.info("Transport selected", {
        requested: transportType || "default",
        selected: "stdio",
        fallback: false,
        message: "Using stdio transport",
        timestamp: new Date().toISOString(),
      });
    }

    serverState.transport = transport;
    if (transport) {
      logger.info(`Connecting transport: ${transport}`);
      await server.connect(transport);
    } else {
      logger.info("No persistent transport - using HTTP-only mode");
    }

    // Set up HTTP server for streamable transport if requested
    if (transportType === "http" || transportType === "streamable") {
      await setupHttpServer(server, sessionService);
    }

    // Update server state
    serverState.isRunning = true;
    serverState.startTime = Date.now();

    logger.info("MCP Server connected and listening.");

    // For HTTP-only mode, keep the process alive
    if (transportType === "http" || transportType === "streamable") {
      // Keep the process alive since we don't have a persistent transport
      // The HTTP server will handle all requests
      process.on("SIGINT", () => shutdown("SIGINT"));
      process.on("SIGTERM", () => shutdown("SIGTERM"));
    }
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

  // Stop session service cleanup interval if it exists
  if (serverState.sessionService) {
    try {
      logger.info("Stopping session service cleanup interval...");
      serverState.sessionService.stopCleanupInterval();
      logger.info("Session service cleanup interval stopped.");
    } catch (error) {
      hasError = true;
      logger.error("Error stopping session service cleanup interval:", error);
    }
  }

  // Close all MCP client connections
  if (serverState.mcpClientService) {
    try {
      logger.info("Closing all MCP client connections...");
      serverState.mcpClientService.closeAllConnections();
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

  // Close HTTP server if it exists
  if (serverState.httpServer) {
    try {
      logger.info("Closing HTTP server...");
      serverState.httpServer.close();
      logger.info("HTTP server closed successfully");
    } catch (error) {
      hasError = true;
      logger.error("Error during HTTP server shutdown:", error);
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
