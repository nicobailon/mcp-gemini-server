import { z } from "zod";

// --- Reusable Schemas (Import or define if not already shared) ---
// Assuming these are defined elsewhere or we redefine them here for clarity

// Based on src/tools/geminiGenerateContentParams.ts
const SafetySettingSchema = z
  .object({
    category: z
      .enum([
        "HARM_CATEGORY_UNSPECIFIED",
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_DANGEROUS_CONTENT",
      ])
      .describe("Category of harmful content to apply safety settings for."),
    threshold: z
      .enum([
        "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
        "BLOCK_LOW_AND_ABOVE",
        "BLOCK_MEDIUM_AND_ABOVE",
        "BLOCK_ONLY_HIGH",
        "BLOCK_NONE",
      ])
      .describe(
        "Threshold for blocking harmful content. Higher thresholds block more content."
      ),
  })
  .describe(
    "Setting for controlling content safety for a specific harm category."
  );

// Schema for thinking configuration
const ThinkingConfigSchema = z
  .object({
    thinkingBudget: z
      .number()
      .int()
      .min(0)
      .max(24576)
      .optional()
      .describe(
        "Controls the amount of reasoning the model performs. Range: 0-24576. Lower values provide faster responses, higher values improve complex reasoning."
      ),
  })
  .optional()
  .describe("Optional configuration for controlling model reasoning.");

// Based on src/tools/geminiGenerateContentParams.ts
const GenerationConfigSchema = z
  .object({
    temperature: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        "Controls randomness. Lower values (~0.2) make output more deterministic, higher values (~0.8) make it more creative. Default varies by model."
      ),
    topP: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        "Nucleus sampling parameter. The model considers only tokens with probability mass summing to this value. Default varies by model."
      ),
    topK: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Top-k sampling parameter. The model considers the k most probable tokens. Default varies by model."
      ),
    maxOutputTokens: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Maximum number of tokens to generate in the response."),
    stopSequences: z
      .array(z.string())
      .optional()
      .describe("Sequences where the API will stop generating further tokens."),
    thinkingConfig: ThinkingConfigSchema,
  })
  .describe("Optional configuration for controlling the generation process.");

// --- Tool Definition ---

export const GEMINI_SEND_MESSAGE_TOOL_NAME = "gemini_sendMessage";

export const GEMINI_SEND_MESSAGE_TOOL_DESCRIPTION = `Sends a message to an existing Gemini chat session, identified by its sessionId. Returns the model's response, which might include text or a function call request.`;

export const GEMINI_SEND_MESSAGE_PARAMS = {
  sessionId: z
    .string()
    .uuid() // Assuming UUID for session IDs
    .describe(
      "Required. The unique identifier of the chat session to send the message to."
    ),
  message: z
    .string()
    .min(1)
    .describe(
      "Required. The text message content to send to the model. (Note: Currently only supports text input; complex Part types like images are not yet supported by this tool parameter)."
    ),
  // TODO: Enhance 'message' schema to support PartListUnion (text, inlineData, fileData etc.) if needed.
  generationConfig: GenerationConfigSchema.optional().describe(
    "Optional. Per-request generation configuration settings to override session defaults for this turn."
  ),
  safetySettings: z
    .array(SafetySettingSchema)
    .optional()
    .describe(
      "Optional. Per-request safety settings to override session defaults for this turn."
    ),
  // Add optional tools parameter, mirroring startChat
  tools: z
    .array(
      z.object({
        // Reusing inline schema definition for now
        functionDeclarations: z
          .array(
            z.object({
              name: z.string().min(1),
              description: z.string().min(1),
              parameters: z.object({
                type: z.literal("OBJECT"),
                properties: z.record(z.any()), // Simplified for brevity, ideally use full recursive schema
                required: z.array(z.string()).optional(),
              }),
            })
          )
          .optional(),
      })
    )
    .optional()
    .describe(
      "Optional. Per-request tools definition (e.g., function declarations) to override session defaults for this turn."
    ),
  toolConfig: z
    .object({
      functionCallingConfig: z
        .object({
          mode: z
            .enum(["AUTO", "ANY", "NONE"])
            .optional()
            .describe("The function calling mode."),
          allowedFunctionNames: z
            .array(z.string())
            .optional()
            .describe("Optional list of function names allowed."),
        })
        .optional(),
    })
    .optional()
    .describe(
      "Optional. Per-request tool configuration, e.g., to force function calling mode."
    ),
  cachedContentName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional. Identifier for cached content in format 'cachedContents/...' to use with this chat message."
    ),
};

// Type helper for arguments
export type GeminiSendMessageArgs = z.infer<
  z.ZodObject<typeof GEMINI_SEND_MESSAGE_PARAMS>
>;
