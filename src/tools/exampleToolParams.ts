import { z } from 'zod';

export const TOOL_NAME = "exampleTool";

export const TOOL_DESCRIPTION = "An example tool that takes a name and returns a greeting message. Demonstrates the basic structure of an MCP tool using Zod for parameter definition.";

// Define parameters using Zod for validation and description generation
export const TOOL_PARAMS = {
    name: z.string()
        .min(1, { message: "Name cannot be empty." })
        .max(50, { message: "Name cannot exceed 50 characters." })
        .describe("The name to include in the greeting message. Required, 1-50 characters."),

    // Example optional parameter
    language: z.enum(['en', 'es', 'fr'])
        .optional()
        .describe("Optional language code for the greeting (e.g., 'en', 'es', 'fr'). Defaults to 'en' if not provided or invalid.")
};

// Optional: Define a Zod schema for the entire input object if needed for validation within the tool
// export const exampleToolInputSchema = z.object(TOOL_PARAMS);
