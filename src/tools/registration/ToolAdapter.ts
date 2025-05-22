/**
 * Tool Adapter
 *
 * Provides adapter functions to convert existing tool implementations
 * to work with the new standardized registry system.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ServiceContainer, ToolRegistrationFn } from "./ToolRegistry.js";
import { GeminiService } from "../../services/GeminiService.js";
import { McpClientService } from "../../services/mcp/McpClientService.js";
import { logger } from "../../utils/logger.js";

/**
 * Legacy tool function that only accepts server parameter
 */
export type LegacyServerOnlyTool = (server: McpServer) => void;

/**
 * Legacy tool function that accepts server and GeminiService
 */
export type LegacyGeminiServiceTool = (
  server: McpServer,
  service: GeminiService
) => void;

/**
 * Legacy tool function that accepts server and McpClientService
 */
export type LegacyMcpClientServiceTool = (
  server: McpServer,
  service: McpClientService
) => void;

/**
 * Adapts a legacy tool that only uses server to the new registration system
 * @param tool Legacy tool function
 * @param name Optional name for logging
 */
export function adaptServerOnlyTool(
  tool: LegacyServerOnlyTool,
  name?: string
): ToolRegistrationFn {
  return (server: McpServer, _services: ServiceContainer) => {
    try {
      tool(server);
      if (name) {
        logger.debug(`Registered server-only tool: ${name}`);
      }
    } catch (error) {
      logger.error(
        `Failed to register server-only tool${name ? ` ${name}` : ""}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };
}

/**
 * Adapts a legacy tool that uses GeminiService to the new registration system
 * @param tool Legacy tool function
 * @param name Optional name for logging
 */
export function adaptGeminiServiceTool(
  tool: LegacyGeminiServiceTool,
  name?: string
): ToolRegistrationFn {
  return (server: McpServer, services: ServiceContainer) => {
    try {
      tool(server, services.geminiService);
      if (name) {
        logger.debug(`Registered GeminiService tool: ${name}`);
      }
    } catch (error) {
      logger.error(
        `Failed to register GeminiService tool${name ? ` ${name}` : ""}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };
}

/**
 * Adapts a legacy tool that uses McpClientService to the new registration system
 * @param tool Legacy tool function
 * @param name Optional name for logging
 */
export function adaptMcpClientServiceTool(
  tool: LegacyMcpClientServiceTool,
  name?: string
): ToolRegistrationFn {
  return (server: McpServer, services: ServiceContainer) => {
    try {
      tool(server, services.mcpClientService);
      if (name) {
        logger.debug(`Registered McpClientService tool: ${name}`);
      }
    } catch (error) {
      logger.error(
        `Failed to register McpClientService tool${name ? ` ${name}` : ""}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };
}

/**
 * Adapts a direct tool implementation that bypasses the normal registration
 * @param name Tool name
 * @param description Tool description
 * @param handler The handler function
 */
export function adaptDirectTool(
  name: string,
  description: string,
  handler: (args: unknown) => Promise<unknown>
): ToolRegistrationFn {
  return (server: McpServer, _services: ServiceContainer) => {
    try {
      server.tool(name, description, {}, handler);
      logger.debug(`Registered direct tool: ${name}`);
    } catch (error) {
      logger.error(
        `Failed to register direct tool ${name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };
}
