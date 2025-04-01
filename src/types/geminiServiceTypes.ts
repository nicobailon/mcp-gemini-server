import { z } from 'zod'; // <-- ADD THIS FUCKING IMPORT

/**
 * Type definitions specific to the GeminiService.
 */

/**
 * Configuration interface for the GeminiService.
 * Currently only requires the API key.
 */
export interface GeminiServiceConfig {
    apiKey: string;
    defaultModel?: string; // Optional default model name from env var
    // Potentially add other config options later
}

/**
 * Represents the metadata of a file managed by the Gemini API.
 * Based on the structure returned by the @google/genai SDK's File API.
 */
export interface FileMetadata {
    name: string; // e.g., "files/abc123xyz"
    displayName?: string;
    mimeType: string;
    sizeBytes: string; // Note: SDK seems to return this as a string
    createTime: string; // ISO 8601 format string
    updateTime: string; // ISO 8601 format string
    expirationTime?: string; // ISO 8601 format string
    sha256Hash: string;
    uri: string; // The https URI to the file content
    state: 'PROCESSING' | 'ACTIVE' | 'FAILED' | string; // State of the file
    // Potentially other fields depending on SDK version
}

/**
 * Represents the metadata of cached content managed by the Gemini API.
 * Based on the structure returned by the @google/genai SDK's Caching API.
 */
export interface CachedContentMetadata {
    name: string; // e.g., "cachedContents/abc123xyz"
    displayName?: string;
    model: string; // Model name this cache is tied to
    createTime: string; // ISO 8601 format string
    updateTime: string; // ISO 8601 format string
    expireTime?: string; // ISO 8601 format string
    // sizeBytes: string; // This field does not seem to exist on the SDK type
    // Add usageMetadata fields if needed based on SDK type
    usageMetadata?: {
        totalTokenCount?: number;
        // Potentially other usage fields
    };
}

// --- Zod Schemas for SDK Content/Part Types ---
// Based on @google/genai types

// Define individual Part schemas first
const BlobSchema = z.object({
    mimeType: z.string(),
    data: z.string(), // Base64 encoded data
}).strict();

const FileDataSchema = z.object({
    mimeType: z.string(),
    fileUri: z.string().url(),
}).strict();

// Note: FunctionCall args/response can be any JSON object structure
const FunctionCallSchema = z.object({
    name: z.string(),
    args: z.record(z.unknown()), // Allows any JSON structure for args
    id: z.string().optional(), // Added based on SDK type inspection
}).strict();

const FunctionResponseSchema = z.object({
    name: z.string(),
    response: z.record(z.unknown()), // Allows any JSON structure for response
    id: z.string().optional(), // Added based on SDK type inspection
}).strict();

// Define the main Part schema using discriminated union if possible, or optional fields
// Using optional fields as discriminated union with zod can be tricky with multiple optional fields
export const PartSchema = z.object({
    text: z.string().optional(),
    inlineData: BlobSchema.optional(),
    functionCall: FunctionCallSchema.optional(),
    functionResponse: FunctionResponseSchema.optional(),
    fileData: FileDataSchema.optional(),
    // Add other part types like executableCode, codeExecutionResult, videoMetadata if needed later
}).strict().refine(
    // Ensure exactly one field is set (or none, though SDK might require one)
    // This validation might be complex depending on exact SDK requirements
    (part) => {
        const setFields = Object.values(part).filter(v => v !== undefined).length;
        return setFields === 1; // Adjust if zero fields are allowed or more complex validation needed
    },
    { message: "Exactly one field must be set in a Part object (text, inlineData, functionCall, functionResponse, or fileData)." }
);

// Define the Content schema
export const ContentSchema = z.object({
    parts: z.array(PartSchema).min(1), // Must have at least one part
    role: z.enum(['user', 'model', 'function', 'tool']).optional(), // Role is optional for some contexts
}).strict();
