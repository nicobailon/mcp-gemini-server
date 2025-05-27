import { GeminiService } from "../services/GeminiService.js";
import type { ImagePart } from "@google/genai";
import { geminiAnalyzeImageUrlParamsSchema } from "./geminiAnalyzeImageUrlParams.js";
import {
  GeminiUrlValidationError,
  GeminiUrlFetchError,
  mapGeminiError,
} from "../utils/geminiErrors.js";
import { logger } from "../utils/logger.js";

/**
 * Tool for analyzing images from URLs using Gemini Vision API
 *
 * This tool:
 * 1. Validates the provided image URL for security
 * 2. Downloads the image content
 * 3. Validates it's a supported image format (PNG, JPEG, WEBP)
 * 4. Converts the image to base64
 * 5. Sends it to Gemini for analysis with the provided prompt
 *
 * @param geminiService - The Gemini service instance
 * @param params - The tool parameters containing imageUrl and prompt
 * @returns Promise resolving to the analysis result
 */
export async function geminiAnalyzeImageUrl(
  geminiService: GeminiService,
  params: unknown
): Promise<string> {
  try {
    // Validate parameters
    const validatedParams = geminiAnalyzeImageUrlParamsSchema.parse(params);
    const { imageUrl, prompt } = validatedParams;

    logger.debug("Analyzing image from URL", {
      imageUrl,
      promptLength: prompt.length,
    });

    // Process the image URL to get base64 data
    let imagePart: ImagePart;
    try {
      imagePart = await geminiService.processImageUrl(imageUrl);
    } catch (error) {
      // Provide user-friendly error messages
      if (error instanceof GeminiUrlValidationError) {
        throw new Error(`Invalid or blocked URL: ${error.message}`);
      }
      if (error instanceof GeminiUrlFetchError) {
        throw new Error(`Failed to fetch image: ${error.message}`);
      }
      if (error instanceof Error && error.message.includes("Content-Type")) {
        throw new Error(
          "The URL does not point to a valid image file. Please ensure the URL points directly to an image (PNG, JPEG, or WEBP)."
        );
      }
      if (
        error instanceof Error &&
        error.message.includes("Unsupported image format")
      ) {
        throw new Error(error.message);
      }
      throw error;
    }

    // Use the new analyzeImageWithPrompt method that properly handles multimodal content
    const response = await geminiService.analyzeImageWithPrompt(
      imagePart,
      prompt
    );

    logger.debug("Successfully analyzed image", { imageUrl });

    return response;
  } catch (error) {
    logger.error("Error analyzing image from URL", { error });

    // Map to appropriate Gemini error or re-throw
    throw mapGeminiError(error, "analyzeImageUrl");
  }
}

// Export the tool in the new format for adaptNewGeminiServiceToolObject
export const geminiAnalyzeImageUrlTool = {
  name: "analyzeImageUrl",
  description:
    "Analyze an image from a URL using Google's Gemini Vision API. Supports PNG, JPEG, and WEBP formats up to 20MB.",
  inputSchema: geminiAnalyzeImageUrlParamsSchema,
  execute: async (
    args: unknown,
    geminiService: GeminiService
  ): Promise<string> => {
    return geminiAnalyzeImageUrl(geminiService, args);
  },
};
