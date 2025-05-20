import { z } from "zod";

export const TOOL_NAME = "mcpDisconnectFromServer";
export const TOOL_DESCRIPTION = "Closes an active connection to an MCP server.";

export const TOOL_PARAMS = {
  connectionId: z
    .string()
    .min(1, "Connection ID cannot be empty.")
    .describe("The ID of the active MCP connection to close."),
};

// Create a schema for type inference
const mcpDisconnectFromServerSchema = z.object(TOOL_PARAMS);
export type McpDisconnectFromServerParams = z.infer<
  typeof mcpDisconnectFromServerSchema
>;
