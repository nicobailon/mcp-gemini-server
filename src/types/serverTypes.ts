/**
 * Server-related type definitions for the MCP Gemini Server
 */

import type { Server as HttpServer } from "http";
import type { Transport } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Interface for session service implementations
 */
export interface SessionServiceLike {
  stopCleanupInterval(): void;
}

/**
 * Interface for MCP client service implementations
 */
export interface McpClientServiceLike {
  disconnect(serverId: string): boolean;
  closeAllConnections(): void;
}

/**
 * Interface for server implementations that can be disconnected
 */
export interface ServerLike {
  disconnect?(): Promise<void> | void;
}

/**
 * Server state interface for tracking the overall server state
 */
export interface ServerState {
  isRunning: boolean;
  startTime: number | null;
  transport: Transport | null;
  server: ServerLike | null;
  healthCheckServer: HttpServer | null;
  mcpClientService: McpClientServiceLike | null;
  sessionService?: SessionServiceLike | null;
  httpServer?: HttpServer | null;
}

/**
 * Test-specific server state type that makes mcpClientService optional
 */
export type TestServerState = Omit<ServerState, "mcpClientService"> & {
  mcpClientService?: McpClientServiceLike | null;
};

/**
 * JSON-RPC 2.0 initialize request structure
 */
export interface JsonRpcInitializeRequest {
  jsonrpc: "2.0";
  method: "initialize";
  id: string | number;
  params?: Record<string, unknown>;
}
