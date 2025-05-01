import { z } from "zod";
import { SafetySetting } from "./GeminiTypes.js";

/**
 * Validation schemas for Gemini API parameters
 * These schemas ensure type safety and provide runtime validation
 */

/**
 * Valid image resolutions supported by Gemini image generation
 */
export const ImageResolutionSchema = z.enum([
  "512x512", 
  "1024x1024", 
  "1536x1536"
]).default("1024x1024");

/**
 * Harm categories for safety settings
 */
export const HarmCategorySchema = z.enum([
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT"
]);

/**
 * Blocking thresholds for safety settings
 */
export const BlockThresholdSchema = z.enum([
  "BLOCK_NONE",
  "BLOCK_LOW_AND_ABOVE",
  "BLOCK_MEDIUM_AND_ABOVE",
  "BLOCK_HIGH_AND_ABOVE"
]);

/**
 * Safety setting schema for content filtering
 */
export const SafetySettingSchema = z.object({
  category: HarmCategorySchema,
  threshold: BlockThresholdSchema
});

/**
 * Image generation parameters schema
 */
export const ImageGenerationParamsSchema = z.object({
  prompt: z.string().min(1).max(1000),
  modelName: z.string().min(1).optional(),
  resolution: ImageResolutionSchema.optional(),
  numberOfImages: z.number().int().min(1).max(8).default(1),
  safetySettings: z.array(SafetySettingSchema).optional(),
  negativePrompt: z.string().max(1000).optional(),
  // New advanced parameters
  stylePreset: z.string().optional(),
  seed: z.number().int().optional(),
  styleStrength: z.number().min(0).max(1).optional()
});

/**
 * Type representing validated image generation parameters
 */
export type ValidatedImageGenerationParams = z.infer<typeof ImageGenerationParamsSchema>;

/**
 * Default safety settings to apply if none are provided
 */
export const DEFAULT_SAFETY_SETTINGS: SafetySetting[] = [
  {
    category: "HARM_CATEGORY_HARASSMENT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE"
  },
  {
    category: "HARM_CATEGORY_HATE_SPEECH",
    threshold: "BLOCK_MEDIUM_AND_ABOVE"
  },
  {
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE"
  },
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE"
  }
];

/**
 * Style presets available for image generation
 */
export const STYLE_PRESETS = [
  "photographic",
  "digital-art",
  "cinematic",
  "anime",
  "3d-render",
  "oil-painting",
  "watercolor",
  "pixel-art",
  "sketch",
  "comic-book",
  "neon",
  "fantasy"
] as const;

/**
 * Validates image generation parameters
 * @param params Raw parameters provided by the caller
 * @returns Validated parameters with defaults applied
 * @throws ZodError if validation fails
 */
export function validateImageGenerationParams(
  prompt: string,
  modelName?: string,
  resolution?: "512x512" | "1024x1024" | "1536x1536",
  numberOfImages?: number,
  safetySettings?: SafetySetting[],
  negativePrompt?: string,
  stylePreset?: string,
  seed?: number,
  styleStrength?: number
): ValidatedImageGenerationParams {
  return ImageGenerationParamsSchema.parse({
    prompt,
    modelName,
    resolution,
    numberOfImages,
    safetySettings,
    negativePrompt,
    stylePreset,
    seed,
    styleStrength
  });
}