import { z } from 'zod';

// --- Reusable Schemas (potentially move to a shared types file later) ---

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

// --- Schemas specific to Chat History ---

// Simplified Part schema for history (focus on text)
// Based on @google/genai Part type
const HistoryPartSchema = z.object({
    text: z.string().describe("Text content of the part."),
    // Note: Add other part types like inlineData, functionCall, functionResponse if needed for history initialization
}).describe("A part of a historical message, primarily text for initialization.");

// Content schema based on SDK types
// Based on @google/genai Content type
const HistoryContentSchema = z.object({
    role: z.enum(['user', 'model']).describe("The role of the entity that generated this content (user or model)."),
    parts: z.array(HistoryPartSchema).min(1).describe("An array of Parts making up the message content.")
}).describe("A single message turn in the conversation history.");


// --- Schemas for Function Calling Tools (Copied from geminiFunctionCallParams.ts for now) ---

const functionParameterTypeSchema = z.enum([
    "OBJECT", "STRING", "NUMBER", "BOOLEAN", "ARRAY", "INTEGER"
]).describe("The data type of the function parameter.");

const baseFunctionParameterSchema = z.object({
    type: functionParameterTypeSchema,
    description: z.string().optional().describe("Description of the parameter's purpose."),
    enum: z.array(z.string()).optional().describe("Allowed string values for an ENUM-like parameter.")
});

type FunctionParameterSchemaType = z.infer<typeof baseFunctionParameterSchema> & {
    properties?: { [key: string]: FunctionParameterSchemaType };
    required?: string[];
    items?: FunctionParameterSchemaType;
};

const functionParameterSchema: z.ZodType<FunctionParameterSchemaType> = baseFunctionParameterSchema.extend({
    properties: z.lazy(() => z.record(functionParameterSchema).optional()),
    required: z.lazy(() => z.array(z.string()).optional().describe("List of required property names for OBJECT types.")),
    items: z.lazy(() => functionParameterSchema.optional().describe("Defines the schema for items if the parameter type is ARRAY."))
}).describe("Schema defining a single parameter for a function declaration, potentially recursive.");

const functionParameterPropertiesSchema = z.record(functionParameterSchema)
    .describe("Defines nested properties if the parameter type is OBJECT.");

const functionDeclarationSchema = z.object({
    name: z.string().min(1).describe("The name of the function to be called."),
    description: z.string().min(1).describe("A description of what the function does."),
    parameters: z.object({
        type: z.literal("OBJECT").describe("The top-level parameters structure must be an OBJECT."),
        properties: functionParameterPropertiesSchema.describe("Defines the parameters the function accepts."),
        required: z.array(z.string()).optional().describe("List of required parameter names at the top level.")
    }).describe("Schema defining the parameters the function accepts.")
}).describe("Declaration of a single function that the Gemini model can request to call.");

// Schema for the 'tools' array expected by the SDK (simplified for chat start)
const ToolSchema = z.object({
    functionDeclarations: z.array(functionDeclarationSchema).optional().describe("List of function declarations for this tool.")
    // Add other tool types like Retrieval, GoogleSearchRetrieval if needed later
}).describe("Represents a tool definition containing function declarations.");


// --- Tool Definition ---

export const GEMINI_START_CHAT_TOOL_NAME = "gemini_startChat";

export const GEMINI_START_CHAT_TOOL_DESCRIPTION = `Initiates a new stateful chat session with a specified Gemini model. Returns a unique sessionId to be used in subsequent chat messages. Optionally accepts initial conversation history and session-wide generation/safety configurations.`;

export const GEMINI_START_CHAT_PARAMS = {
    modelName: z.string().min(1).optional() // Make optional
        .describe("Optional. The name of the Gemini model to use for this chat session (e.g., 'gemini-1.5-flash'). If omitted, the server's default model (from GOOGLE_GEMINI_MODEL env var) will be used."),
    history: z.array(HistoryContentSchema).optional()
        .describe("Optional. An array of initial conversation turns to seed the chat session. Must alternate between 'user' and 'model' roles, starting with 'user'."),
    tools: z.array(ToolSchema).optional()
        .describe("Optional. A list of tools (currently only supporting function declarations) the model may use during the chat session."),
    generationConfig: GenerationConfigSchema.optional()
        .describe("Optional. Session-wide generation configuration settings."),
    safetySettings: z.array(SafetySettingSchema).optional()
        .describe("Optional. Session-wide safety settings to apply.")
    // Note: toolConfig is usually applied per-request in sendMessage/sendFunctionResult, not typically at chat start.
};

// Type helper for arguments
export type GeminiStartChatArgs = z.infer<z.ZodObject<typeof GEMINI_START_CHAT_PARAMS>>;
