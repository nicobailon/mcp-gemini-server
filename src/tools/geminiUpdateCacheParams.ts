import { z } from 'zod';

export const TOOL_NAME_UPDATE_CACHE = "gemini_updateCache";

export const TOOL_DESCRIPTION_UPDATE_CACHE = `
Updates metadata (TTL and/or displayName) for a specific cached content resource.
Requires the unique cache name (e.g., 'cachedContents/abc123xyz').
Returns the updated cache metadata.
`;

// Define an object containing individual Zod schemas for each parameter
export const UpdateCacheParamsObject = {
    cacheName: z.string().min(1).regex(/^cachedContents\/.+$/, "Cache name must start with 'cachedContents/'").describe(
        "Required. The unique name/ID of the cache to update (e.g., 'cachedContents/abc123xyz')."
    ),
    ttl: z.string().regex(/^\d+(\.\d+)?s$/, "TTL must be a duration string ending in 's' (e.g., '3600s', '7200.5s')").optional().describe(
        "Optional. The new time-to-live for the cache as a duration string (e.g., '3600s' for 1 hour). Max 48 hours." // Note: Max TTL might vary.
    ),
    displayName: z.string().min(1).max(100).optional().describe(
        "Optional. The new human-readable name for the cache. Max 100 chars."
    )
};

// Define the type based on the object of schemas
// Add refinement to ensure at least one update field (ttl or displayName) is provided
const CombinedSchema = z.object(UpdateCacheParamsObject).strict().refine(
    (data) => data.ttl !== undefined || data.displayName !== undefined,
    { message: "At least one of 'ttl' or 'displayName' must be provided to update the cache." }
);
export type UpdateCacheParams = z.infer<typeof CombinedSchema>;

// Also export the combined schema if needed elsewhere
export const UpdateCacheParamsSchema = CombinedSchema;
