import { z } from "zod";

// Tool Name
export const TOOL_NAME_GENERATE_IMAGE = "gemini_generateImage";

// Tool Description
export const TOOL_DESCRIPTION_GENERATE_IMAGE = `
Generates images from text prompts using the Gemini 2.5 Flash model.
This tool takes a text prompt and optional parameters to control the image generation process.
Returns one or more generated images as base64-encoded data with appropriate MIME types.
Supports configurable resolutions, image counts, and content safety settings.
`;

// Zod Schema for image resolution
export const imageResolutionSchema = z
  .enum(["512x512", "1024x1024", "1536x1536"])
  .describe("The desired resolution of generated images.");

// Reuse existing safety settings schema from content generation
import { safetySettingSchema } from "./geminiGenerateContentParams";

// Main parameters schema
export const GEMINI_GENERATE_IMAGE_PARAMS = {
  modelName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional. The name of the Gemini model to use (e.g., 'gemini-2.5-flash'). If omitted, the server's default model will be used."
    ),
  prompt: z
    .string()
    .min(1)
    .describe(
      "Required. The text prompt describing the desired image for the model to generate."
    ),
  resolution: imageResolutionSchema
    .optional()
    .describe(
      "Optional. The desired resolution of the generated image(s). Defaults to '1024x1024' if not specified."
    ),
  numberOfImages: z
    .number()
    .int()
    .min(1)
    .max(4)
    .optional()
    .describe(
      "Optional. Number of images to generate (1-4). Defaults to 1 if not specified."
    ),
  safetySettings: z
    .array(safetySettingSchema)
    .optional()
    .describe(
      "Optional. A list of safety settings to apply, overriding default model safety settings. Each setting specifies a harm category and a blocking threshold."
    ),
  negativePrompt: z
    .string()
    .optional()
    .describe(
      "Optional. Text description of features to avoid in the generated image(s)."
    ),
};

// Type for parameter object using zod inference
export type GeminiGenerateImageArgs = z.infer<
  typeof GEMINI_GENERATE_IMAGE_PARAMS
>;
