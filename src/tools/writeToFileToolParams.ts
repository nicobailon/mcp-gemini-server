import { z } from "zod";

export const TOOL_NAME = "writeToFile";

export const TOOL_DESCRIPTION =
  "Writes the given content to a specified file path. The path must be within an allowed directory.";

// Define parameters using Zod for validation and description generation
export const TOOL_PARAMS = {
  filePath: z
    .string()
    .min(1, "File path cannot be empty.")
    .describe("The path to the file where content will be written."),

  content: z.string().describe("The content to write to the file."),

  encoding: z
    .enum(["utf8", "base64"])
    .optional()
    .default("utf8")
    .describe("Encoding of the content. Defaults to utf8."),

  overwriteFile: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Optional. If true, will overwrite the file if it already exists. Defaults to false."
    ),
};

// Create a complete Zod object schema for type inference
export const writeToFileSchema = z.object(TOOL_PARAMS);

// Export type for the parameters
export type WriteToFileParams = z.infer<typeof writeToFileSchema>;
