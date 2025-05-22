import { z } from "zod";

export const TOOL_NAME = "mcpListServerTools";
export const TOOL_DESCRIPTION =
  "Lists available tools on a connected MCP server.";

export const TOOL_PARAMS = {
  connectionId: z
    .string()
    .min(1, "Connection ID cannot be empty.")
    .describe("The ID of the active MCP connection."),
};

// Create a schema for type inference
const mcpListServerToolsSchema = z.object(TOOL_PARAMS);
export type McpListServerToolsParams = z.infer<typeof mcpListServerToolsSchema>;
