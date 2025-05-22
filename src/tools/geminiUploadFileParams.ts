import { z } from "zod";

export const TOOL_NAME_UPLOAD_FILE = "gemini_uploadFile";

export const TOOL_DESCRIPTION_UPLOAD_FILE = `
Uploads a file (specified by a local path) to be used with the Gemini API.
NOTE: This API is not supported on Vertex AI clients. It only works with Google AI Studio API keys.
Returns metadata about the uploaded file, including its unique name and URI.
`;

// Define an object containing individual Zod schemas for each parameter
export const UploadFileParamsObject = {
  filePath: z
    .string()
    .min(1)
    .describe(
      "Required. The full local path to the file that needs to be uploaded."
    ),
  displayName: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe(
      "Optional. A human-readable name for the file in the API. Max 100 chars."
    ),
  mimeType: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional. The IANA MIME type of the file (e.g., 'text/plain', 'image/jpeg'). If omitted, the server will attempt to infer it from the file extension of filePath."
    ),
};

// Define the type based on the object of schemas
// We still need the combined type for the processRequest function signature
const CombinedSchema = z.object(UploadFileParamsObject).strict();
export type UploadFileParams = z.infer<typeof CombinedSchema>;

// Also export the combined schema if needed elsewhere, though the tool registration uses the object
export const UploadFileParamsSchema = CombinedSchema;
