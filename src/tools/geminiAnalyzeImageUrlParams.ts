import { z } from "zod";

/**
 * Schema for the analyzeImageUrl tool parameters
 *
 * This tool allows analyzing images from URLs using Google's Gemini Vision API.
 * It validates the URL, downloads the image, converts it to base64, and sends it
 * to Gemini for analysis based on the provided prompt.
 */
export const geminiAnalyzeImageUrlParamsSchema = z.object({
  imageUrl: z
    .string()
    .url()
    .describe(
      "The URL of the image to analyze. Must be a valid HTTP/HTTPS URL pointing to an image file."
    ),

  prompt: z
    .string()
    .min(1)
    .trim()
    .describe(
      "The prompt describing what to analyze in the image. This guides the AI's analysis and response."
    ),
});

export type GeminiAnalyzeImageUrlParams = z.infer<
  typeof geminiAnalyzeImageUrlParamsSchema
>;
