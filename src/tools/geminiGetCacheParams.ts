import { z } from 'zod';

export const TOOL_NAME_GET_CACHE = "gemini_getCache";

export const TOOL_DESCRIPTION_GET_CACHE = `
Retrieves metadata for a specific cached content resource.
Requires the unique cache name (e.g., 'cachedContents/abc123xyz').
`;

// Define an object containing individual Zod schemas for each parameter
export const GetCacheParamsObject = {
    cacheName: z.string().min(1).regex(/^cachedContents\/.+$/, "Cache name must start with 'cachedContents/'").describe(
        "Required. The unique name/ID of the cache to retrieve metadata for (e.g., 'cachedContents/abc123xyz')."
    )
};

// Define the type based on the object of schemas
const CombinedSchema = z.object(GetCacheParamsObject).strict();
export type GetCacheParams = z.infer<typeof CombinedSchema>;

// Also export the combined schema if needed elsewhere
export const GetCacheParamsSchema = CombinedSchema;
