import { z } from "zod";

export const TOOL_NAME_LIST_FILES = "gemini_listFiles";

export const TOOL_DESCRIPTION_LIST_FILES = `
Lists files previously uploaded to the Gemini API.
Supports pagination to handle large numbers of files.
NOTE: This API is not supported on Vertex AI clients. It only works with Google AI Studio API keys.
Returns a list of file metadata objects and potentially a token for the next page.
`;

// Define an object containing individual Zod schemas for each parameter
export const ListFilesParamsObject = {
  pageSize: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe(
      "Optional. The maximum number of files to return per page. Defaults to 100 if not specified by the API, max 1000."
    ),
  pageToken: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional. A token received from a previous listFiles call to retrieve the next page of results."
    ),
};

// Define the type based on the object of schemas
const CombinedSchema = z.object(ListFilesParamsObject).strict();
export type ListFilesParams = z.infer<typeof CombinedSchema>;

// Also export the combined schema if needed elsewhere
export const ListFilesParamsSchema = CombinedSchema;
