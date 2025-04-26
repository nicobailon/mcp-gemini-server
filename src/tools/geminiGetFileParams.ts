import { z } from "zod";

export const TOOL_NAME_GET_FILE = "gemini_getFile";

export const TOOL_DESCRIPTION_GET_FILE = `
Retrieves metadata for a specific file previously uploaded to the Gemini API.
NOTE: This API is not supported on Vertex AI clients. It only works with Google AI Studio API keys.
Requires the unique file name (e.g., 'files/abc123xyz').
`;

// Define an object containing individual Zod schemas for each parameter
export const GetFileParamsObject = {
  fileName: z
    .string()
    .min(1)
    .regex(/^files\/.+$/, "File name must start with 'files/'")
    .describe(
      "Required. The unique name/ID of the file to retrieve metadata for (e.g., 'files/abc123xyz')."
    ),
};

// Define the type based on the object of schemas
const CombinedSchema = z.object(GetFileParamsObject).strict();
export type GetFileParams = z.infer<typeof CombinedSchema>;

// Also export the combined schema if needed elsewhere
export const GetFileParamsSchema = CombinedSchema;
