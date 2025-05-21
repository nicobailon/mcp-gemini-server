import { z } from "zod";

export const TOOL_NAME = "mcpConnectToServer";
export const TOOL_DESCRIPTION =
  "Establishes a connection to an MCP server. Returns a connection ID.";

const baseConnectionSchema = z.object({
  clientId: z
    .string()
    .optional()
    .describe(
      "Client ID for the MCP connection. If not provided, will use the configured default."
    ),
  connectionToken: z
    .string()
    .optional()
    .describe(
      "Connection token for the MCP connection. If not provided, will use the configured default."
    ),
});

const stdioConnectionSchema = z
  .object({
    transport: z.literal("stdio"),
    command: z
      .string()
      .min(1, "Command cannot be empty.")
      .describe("The command to execute for stdio connection."),
    args: z
      .array(z.string())
      .optional()
      .describe("Optional arguments to pass to the command."),
  })
  .merge(baseConnectionSchema);

const sseConnectionSchema = z
  .object({
    transport: z.literal("sse"),
    url: z
      .string()
      .url("Invalid URL format.")
      .describe("The URL for the SSE connection."),
  })
  .merge(baseConnectionSchema);

export const TOOL_PARAMS = {
  transport: z
    .enum(["stdio", "sse"])
    .describe("The transport protocol to use for the connection."),
  connectionDetails: z
    .discriminatedUnion("transport", [
      stdioConnectionSchema,
      sseConnectionSchema,
    ])
    .describe("Connection details specific to the chosen transport."),
};

// Create a schema for type inference
const mcpConnectToServerSchema = z.object(TOOL_PARAMS);
export type McpConnectToServerParams = z.infer<typeof mcpConnectToServerSchema>;
