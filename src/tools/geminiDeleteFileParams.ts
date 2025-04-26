import { z } from "zod";

export const TOOL_NAME_DELETE_FILE = "gemini_deleteFile";

export const TOOL_DESCRIPTION_DELETE_FILE = `
Deletes a specific file previously uploaded to the Gemini API.
NOTE: This API is not supported on Vertex AI clients. It only works with Google AI Studio API keys.
Requires the unique file name (e.g., 'files/abc123xyz'). Returns a success confirmation.
`;

// Define an object containing individual Zod schemas for each parameter
export const DeleteFileParamsObject = {
  fileName: z
    .string()
    .min(1)
    .regex(/^files\/.+$/, "File name must start with 'files/'")
    .describe(
      "Required. The unique name/ID of the file to delete (e.g., 'files/abc123xyz')."
    ),
};

// Define the type based on the object of schemas
const CombinedSchema = z.object(DeleteFileParamsObject).strict();
export type DeleteFileParams = z.infer<typeof CombinedSchema>;

// Also export the combined schema if needed elsewhere
export const DeleteFileParamsSchema = CombinedSchema;
