import { z } from "zod";
// Re-use schemas defined in geminiGenerateContentParams.ts for consistency
import {
  generationConfigSchema,
  safetySettingSchema,
} from "./geminiGenerateContentParams.js"; // Assuming these are exported or redefined here

// Tool Name
export const GEMINI_STREAM_TOOL_NAME = "gemini_generateContentStream";

// Tool Description
export const GEMINI_STREAM_TOOL_DESCRIPTION = `
Generates text content using a specified Google Gemini model.
While named "stream", due to limitations in the @modelcontextprotocol/sdk (as of version 1.10.2, April 2025), 
this tool actually receives the streamed response internally from Gemini but returns the complete text at once
when generation is finished. The SDK does not currently support true incremental streaming in tool responses.

It's suitable for handling long responses where you want the server to stream internally with Gemini.
Optional parameters allow control over generation, safety settings, system instructions, and cached content.
`;

// Zod Schema for Parameters
export const GEMINI_STREAM_PARAMS = {
  modelName: z
    .string()
    .min(1)
    .optional() // Make optional
    .describe(
      "Optional. The name of the Gemini model to use (e.g., 'gemini-1.5-flash'). If omitted, the server's default model (from GOOGLE_GEMINI_MODEL env var) will be used."
    ),
  prompt: z
    .string()
    .min(1)
    .describe(
      "Required. The text prompt to send to the Gemini model for content generation."
    ),
  generationConfig: generationConfigSchema, // Re-using schema
  safetySettings: z
    .array(safetySettingSchema)
    .optional() // Re-using schema
    .describe(
      "Optional. A list of safety settings to apply, overriding default model safety settings."
    ),
  systemInstruction: z
    .string()
    .optional()
    .describe(
      "Optional. A system instruction to guide the model's behavior. Acts as context for how the model should respond."
    ),
  cachedContentName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional. Identifier for cached content in format 'cachedContents/...' to use with this request."
    ),
};

// Optional: Define a Zod schema for the entire input object if needed later
// export const geminiStreamInputSchema = z.object(GEMINI_STREAM_PARAMS);
