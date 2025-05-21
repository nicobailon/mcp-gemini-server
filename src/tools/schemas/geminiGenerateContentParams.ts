import { z } from "zod";
import { createToolSchema } from "./BaseToolSchema.js";
import {
  GenerationConfigSchema,
  SafetySettingSchema,
  ModelNameSchema,
  PromptSchema,
} from "./CommonSchemas.js";

const TOOL_NAME = "gemini_generateContent";

const TOOL_DESCRIPTION = `
Generates non-streaming text content using a specified Google Gemini model.
This tool takes a text prompt and returns the complete generated response from the model.
It's suitable for single-turn generation tasks where the full response is needed at once.
Optional parameters allow control over generation (temperature, max tokens, etc.) and safety settings.
`;

const TOOL_PARAMS = {
  modelName: ModelNameSchema,
  prompt: PromptSchema,
  generationConfig: GenerationConfigSchema,
  safetySettings: z
    .array(SafetySettingSchema)
    .optional()
    .describe(
      "Optional. A list of safety settings to apply, overriding default model safety settings. Each setting specifies a harm category and a blocking threshold."
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

// Create standardized schema with helper function
const schema = createToolSchema(
  TOOL_NAME,
  TOOL_DESCRIPTION,
  TOOL_PARAMS
);

// Export all schema components
export const {
  TOOL_NAME: exportedToolName,
  TOOL_DESCRIPTION: exportedToolDescription,
  TOOL_PARAMS: exportedToolParams,
  toolSchema: geminiGenerateContentSchema,
  ToolParams: GeminiGenerateContentParams
} = schema;

// For backward compatibility with existing code
export {
  exportedToolName as GEMINI_GENERATE_CONTENT_TOOL_NAME,
  exportedToolDescription as GEMINI_GENERATE_CONTENT_TOOL_DESCRIPTION,
  exportedToolParams as GEMINI_GENERATE_CONTENT_PARAMS
}