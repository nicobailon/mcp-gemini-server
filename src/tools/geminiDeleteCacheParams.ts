import { z } from "zod";

export const TOOL_NAME_DELETE_CACHE = "gemini_deleteCache";

export const TOOL_DESCRIPTION_DELETE_CACHE = `
Deletes a specific cached content resource.
Requires the unique cache name (e.g., 'cachedContents/abc123xyz').
Returns a success confirmation.
`;

// Define an object containing individual Zod schemas for each parameter
export const DeleteCacheParamsObject = {
  cacheName: z
    .string()
    .min(1)
    .regex(
      /^cachedContents\/.+$/,
      "Cache name must start with 'cachedContents/'"
    )
    .describe(
      "Required. The unique name/ID of the cache to delete (e.g., 'cachedContents/abc123xyz')."
    ),
};

// Define the type based on the object of schemas
const CombinedSchema = z.object(DeleteCacheParamsObject).strict();
export type DeleteCacheParams = z.infer<typeof CombinedSchema>;

// Also export the combined schema if needed elsewhere
export const DeleteCacheParamsSchema = CombinedSchema;
