import { z } from 'zod';
// Re-use schemas defined in geminiGenerateContentParams.ts for consistency
import {
    generationConfigSchema,
    safetySettingSchema
} from './geminiGenerateContentParams.js'; // Assuming these are exported or redefined here

// Tool Name
export const GEMINI_STREAM_TOOL_NAME = "gemini_generateContentStream";

// Tool Description
export const GEMINI_STREAM_TOOL_DESCRIPTION = `
Generates text content as a stream using a specified Google Gemini model.
This tool takes a text prompt and streams back chunks of the generated response as they become available.
It's suitable for interactive use cases or handling long responses.
Optional parameters allow control over generation and safety settings.
`;

// Zod Schema for Parameters
export const GEMINI_STREAM_PARAMS = {
    modelName: z.string().min(1).optional() // Make optional
        .describe("Optional. The name of the Gemini model to use (e.g., 'gemini-1.5-flash'). If omitted, the server's default model (from GOOGLE_GEMINI_MODEL env var) will be used."),
    prompt: z.string().min(1)
        .describe("Required. The text prompt to send to the Gemini model for content generation."),
    generationConfig: generationConfigSchema, // Re-using schema
    safetySettings: z.array(safetySettingSchema).optional() // Re-using schema
        .describe("Optional. A list of safety settings to apply, overriding default model safety settings.")
};

// Optional: Define a Zod schema for the entire input object if needed later
// export const geminiStreamInputSchema = z.object(GEMINI_STREAM_PARAMS);
