import { z } from 'zod';

// --- Reusable Schemas (Import or define if not already shared) ---
// Assuming these are defined elsewhere or we redefine them here for clarity

// Based on src/tools/geminiGenerateContentParams.ts
const SafetySettingSchema = z.object({
    category: z.enum([
        "HARM_CATEGORY_UNSPECIFIED",
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_DANGEROUS_CONTENT"
    ]).describe("Category of harmful content to apply safety settings for."),
    threshold: z.enum([
        "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
        "BLOCK_LOW_AND_ABOVE",
        "BLOCK_MEDIUM_AND_ABOVE",
        "BLOCK_ONLY_HIGH",
        "BLOCK_NONE"
    ]).describe("Threshold for blocking harmful content. Higher thresholds block more content.")
}).describe("Setting for controlling content safety for a specific harm category.");

// Based on src/tools/geminiGenerateContentParams.ts
const GenerationConfigSchema = z.object({
    temperature: z.number().min(0).max(1).optional().describe("Controls randomness. Lower values (~0.2) make output more deterministic, higher values (~0.8) make it more creative. Default varies by model."),
    topP: z.number().min(0).max(1).optional().describe("Nucleus sampling parameter. The model considers only tokens with probability mass summing to this value. Default varies by model."),
    topK: z.number().int().min(1).optional().describe("Top-k sampling parameter. The model considers the k most probable tokens. Default varies by model."),
    maxOutputTokens: z.number().int().min(1).optional().describe("Maximum number of tokens to generate in the response."),
    stopSequences: z.array(z.string()).optional().describe("Sequences where the API will stop generating further tokens.")
}).describe("Optional configuration for controlling the generation process.");

// --- Schema for Function Response Input ---

const FunctionResponseInputSchema = z.object({
    name: z.string().min(1)
        .describe("Required. The name of the function that was called by the model."),
    response: z.record(z.unknown()) // Using z.record(z.unknown()) for a generic JSON object
        .describe("Required. The JSON object result returned by the function execution.")
}).describe("Represents the result of a single function execution to be sent back to the model.");


// --- Tool Definition ---

export const GEMINI_SEND_FUNCTION_RESULT_TOOL_NAME = "gemini_sendFunctionResult";

export const GEMINI_SEND_FUNCTION_RESULT_TOOL_DESCRIPTION = `Sends the result(s) of function execution(s) back to an existing Gemini chat session, identified by its sessionId. Returns the model's subsequent response.`;

export const GEMINI_SEND_FUNCTION_RESULT_PARAMS = {
    sessionId: z.string().uuid() // Assuming UUID for session IDs
        .describe("Required. The unique identifier of the chat session."),
    functionResponses: z.array(FunctionResponseInputSchema).min(1)
        .describe("Required. An array containing the results of the function calls executed by the client. Each item must include the function 'name' and its 'response' object."),
    generationConfig: GenerationConfigSchema.optional()
        .describe("Optional. Per-request generation configuration settings to override session defaults for this turn."),
    safetySettings: z.array(SafetySettingSchema).optional()
        .describe("Optional. Per-request safety settings to override session defaults for this turn.")
};

// Type helper for arguments
export type GeminiSendFunctionResultArgs = z.infer<z.ZodObject<typeof GEMINI_SEND_FUNCTION_RESULT_PARAMS>>;
