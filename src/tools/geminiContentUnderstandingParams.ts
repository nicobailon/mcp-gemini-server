import { z } from "zod";
import { safetySettingSchema } from "./geminiGenerateContentParams.js";
import { ImageInputSchema } from "./geminiObjectDetectionParams.js";

// Tool Name
export const TOOL_NAME_CONTENT_UNDERSTANDING = "gemini_contentUnderstanding";

// Tool Description
export const TOOL_DESCRIPTION_CONTENT_UNDERSTANDING = `
Analyzes visual content such as charts, diagrams, and infographics using Gemini's multimodal capabilities.
Extracts structured information, text, data points, and relationships from visual elements.
Supports both base64-encoded images and image URLs as input.
Can provide responses in either natural language or structured JSON format.
`;

// Main parameters schema
export const GEMINI_CONTENT_UNDERSTANDING_PARAMS = z.object({
  modelName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional. The name of the Gemini model to use (e.g., 'gemini-1.5-pro'). If omitted, the server's default model will be used."
    ),
  image: ImageInputSchema.describe(
    "Required. The input image to analyze, either as base64-encoded data or a URL."
  ),
  prompt: z
    .string()
    .min(1)
    .describe(
      "Required. Specific instructions for analyzing the image (e.g., 'Extract the key metrics from this chart')."
    ),
  structuredOutput: z
    .boolean()
    .default(false)
    .describe(
      "Optional. Whether to return the analysis as structured JSON data. Defaults to false for natural language responses."
    ),
  safetySettings: z
    .array(safetySettingSchema)
    .optional()
    .describe(
      "Optional. A list of safety settings to apply, overriding default model safety settings. Each setting specifies a harm category and a blocking threshold."
    ),
});

// Type for parameter object using zod inference
export type GeminiContentUnderstandingArgs = z.infer<
  typeof GEMINI_CONTENT_UNDERSTANDING_PARAMS
>;
