import { z } from 'zod';
import { ContentSchema } from '../types/index.js'; // Assuming ContentSchema is defined or needs to be

export const TOOL_NAME_CREATE_CACHE = "gemini_createCache";

export const TOOL_DESCRIPTION_CREATE_CACHE = `
Creates a cached content resource for a compatible Gemini model.
Caching can reduce latency and costs for prompts that are reused often.
NOTE: Caching is only supported for specific models (e.g., gemini-1.5-flash, gemini-1.5-pro).
Returns metadata about the created cache.
`;

// Define an object containing individual Zod schemas for each parameter
export const CreateCacheParamsObject = {
    model: z.string().min(1).optional() // Make optional
        .describe("Optional. The name/ID of the model compatible with caching (e.g., 'gemini-1.5-flash'). If omitted, the server's default model (from GOOGLE_GEMINI_MODEL env var) will be used."),
    // Define contents based on SDK's Content structure (array of Parts)
    // This might need refinement based on how ContentSchema is defined
    contents: z.array(ContentSchema).min(1).describe(
        "Required. The content to cache, matching the SDK's Content structure (an array of Parts)."
    ),
    displayName: z.string().min(1).max(100).optional().describe(
        "Optional. A human-readable name for the cache."
    ),
    systemInstruction: ContentSchema.optional().describe( // Assuming ContentSchema can represent a single Content object too
        "Optional. System instructions to associate with the cache."
    ),
    ttl: z.string().regex(/^\d+(\.\d+)?s$/, "TTL must be a duration string ending in 's' (e.g., '3600s', '7200.5s')").optional().describe(
        "Optional. Time-to-live for the cache as a duration string (e.g., '3600s' for 1 hour). Max 48 hours." // Note: Max TTL might vary.
    )
    // expireTime is usually set via TTL by the API, not directly by user typically.
};

// Define the type based on the object of schemas
const CombinedSchema = z.object(CreateCacheParamsObject).strict();
export type CreateCacheParams = z.infer<typeof CombinedSchema>;

// Also export the combined schema if needed elsewhere
export const CreateCacheParamsSchema = CombinedSchema;
