import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpClientService } from "../services/mcp/McpClientService.js";
import { registerAllTools } from "./registration/registerAllTools.js";

/**
 * Register all defined tools with the MCP server instance.
 * This function serves as the central entry point for tool registration.
 * It uses the new tool registration system for improved organization and type safety.
 *
 * @param server The McpServer instance
 * @returns The McpClientService instance for managing MCP client connections
 */
export function registerTools(server: McpServer): McpClientService {
  return registerAllTools(server);
}

// Re-export schema components
export * from "./schemas/index.js";

// Re-export registration utilities
export * from "./registration/index.js";
