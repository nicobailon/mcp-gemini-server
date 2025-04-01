import { z } from 'zod';

export const TOOL_NAME_LIST_CACHES = "gemini_listCaches";

export const TOOL_DESCRIPTION_LIST_CACHES = `
Lists cached content resources available for the project.
Supports pagination.
Returns a list of cache metadata objects and potentially a token for the next page.
`;

// Define an object containing individual Zod schemas for each parameter
export const ListCachesParamsObject = {
    pageSize: z.number().int().positive().max(1000).optional().describe(
        "Optional. The maximum number of caches to return per page. Defaults to 100 if not specified by the API, max 1000."
    ),
    pageToken: z.string().min(1).optional().describe(
        "Optional. A token received from a previous listCaches call to retrieve the next page of results."
    )
};

// Define the type based on the object of schemas
const CombinedSchema = z.object(ListCachesParamsObject).strict();
export type ListCachesParams = z.infer<typeof CombinedSchema>;

// Also export the combined schema if needed elsewhere
export const ListCachesParamsSchema = CombinedSchema;
