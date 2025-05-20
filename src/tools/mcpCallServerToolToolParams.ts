import { z } from "zod";

export const TOOL_NAME = "mcpCallServerTool";
export const TOOL_DESCRIPTION =
  "Calls a specified tool on a connected MCP server. Can optionally write output to a file.";

export const TOOL_PARAMS = {
  connectionId: z
    .string()
    .min(1, "Connection ID cannot be empty.")
    .describe("The ID of the active MCP connection."),
  toolName: z
    .string()
    .min(1, "Tool name cannot be empty.")
    .describe("The name of the tool to call on the remote MCP server."),
  toolParameters: z
    .record(z.any())
    .optional()
    .describe(
      "Parameters to pass to the remote tool (must be a JSON object or value)."
    ),
  outputFilePath: z
    .string()
    .optional()
    .describe(
      "Optional. If provided, the tool's full JSON response will be written to this file. The path must be within an allowed directory."
    ),
};

// Create a schema for type inference
const mcpCallServerToolSchema = z.object(TOOL_PARAMS);
export type McpCallServerToolParams = z.infer<typeof mcpCallServerToolSchema>;
