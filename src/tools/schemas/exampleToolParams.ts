import { z } from "zod";
import { createToolSchema } from "./BaseToolSchema.js";

const TOOL_NAME = "exampleTool";

const TOOL_DESCRIPTION =
  "An example tool that takes a name and returns a greeting message. Demonstrates the basic structure of an MCP tool using Zod for parameter definition.";

const TOOL_PARAMS = {
  name: z
    .string()
    .min(1, { message: "Name cannot be empty." })
    .max(50, { message: "Name cannot exceed 50 characters." })
    .describe(
      "The name to include in the greeting message. Required, 1-50 characters."
    ),

  // Example optional parameter
  language: z
    .enum(["en", "es", "fr"])
    .optional()
    .describe(
      "Optional language code for the greeting (e.g., 'en', 'es', 'fr'). Defaults to 'en' if not provided or invalid."
    ),
};

// Create standardized schema with helper function
const schema = createToolSchema(TOOL_NAME, TOOL_DESCRIPTION, TOOL_PARAMS);

// Export all schema components
export const {
  TOOL_NAME: exportedToolName,
  TOOL_DESCRIPTION: exportedToolDescription,
  TOOL_PARAMS: exportedToolParams,
  toolSchema: exampleToolSchema,
  ToolParams: ExampleToolParams,
} = schema;

// For backward compatibility, re-export with original names
export {
  exportedToolName as TOOL_NAME,
  exportedToolDescription as TOOL_DESCRIPTION,
  exportedToolParams as TOOL_PARAMS,
};
