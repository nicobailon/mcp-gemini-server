import http from "http";
import { logger } from "./logger.js";

// Define an interface for server state
export interface ServerState {
  isRunning: boolean;
  startTime: number | null;
  transport: {
    constructor: {
      name: string;
    };
  } | null;
  server: any; // Could be more specific if server types are known
  healthCheckServer: http.Server | null;
}

// Reference to the server state from server.ts
// This will be set from server.ts
let serverStateRef: ServerState | null = null;

export const setServerState = (state: ServerState) => {
  serverStateRef = state;
};

export const getHealthStatus = () => {
  if (!serverStateRef || !serverStateRef.isRunning) {
    return {
      status: "stopped",
      uptime: 0,
    };
  }

  const uptime = serverStateRef.startTime
    ? Math.floor((Date.now() - serverStateRef.startTime) / 1000)
    : 0;

  return {
    status: "running",
    uptime,
    transport: serverStateRef.transport?.constructor.name || "unknown",
    version: process.env.npm_package_version || "unknown",
  };
};

/**
 * Starts an HTTP server for health checks
 * This runs independently of the MCP server transport
 */
export const startHealthCheckServer = () => {
  const port = parseInt(process.env.HEALTH_CHECK_PORT || "3000", 10);

  const server = http.createServer((req, res) => {
    // Simple routing
    if (req.url === "/health" || req.url === "/") {
      const health = getHealthStatus();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(health));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Health check server port ${port} is already in use`);
    } else {
      logger.error(`Health check server error: ${error.message}`);
    }
  });

  server.listen(port, () => {
    logger.info(`Health check server listening on port ${port}`);
  });

  return server;
};
