import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools/index.js";
import { logger } from "./utils/index.js";
import { McpClientService } from "./services/mcp/McpClientService.js";

/**
 * Result object containing the created server and client service instances
 */
export interface ServerCreationResult {
  server: McpServer;
  mcpClientService: McpClientService;
}

/**
 * Creates and configures an MCP server instance.
 * This is the central function for server creation and tool registration.
 * Note: ConfigurationManager is imported directly by services as needed.
 * @returns {ServerCreationResult} Object containing the configured MCP server and client service instances
 */
export function createServer(): ServerCreationResult {
  logger.info("Creating MCP server instance...");

  // Initialize the server
  const server = new McpServer({
    name: "mcp-server",
    version: "1.0.0",
    description: "MCP Server based on recommended practices",
  });

  // Register all tools and get the McpClientService instance
  const mcpClientService = registerTools(server);

  logger.info("MCP server instance created successfully.");
  return { server, mcpClientService };
}
