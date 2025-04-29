import { z } from "zod";
import { safetySettingSchema } from "./geminiGenerateContentParams.js";

// Tool Name
export const TOOL_NAME_OBJECT_DETECTION = "gemini_objectDetection";

// Tool Description
export const TOOL_DESCRIPTION_OBJECT_DETECTION = `
Detects and localizes objects in images using Gemini's multimodal capabilities.
Returns bounding box coordinates ([ymin, xmin, ymax, xmax]) normalized to 0-1000 scale,
along with object descriptions and confidence scores.
Supports both base64-encoded images and image URLs as input.
Optional parameters allow customization of detection behavior and output format.
`;

// Supported image formats
const SUPPORTED_IMAGE_FORMATS = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

// Schema for image input validation
export const ImageInputSchema = z
  .object({
    type: z
      .enum(["base64", "url"])
      .describe("The type of image input (base64 or URL)"),
    data: z
      .string()
      .min(1)
      .describe(
        "The image data - either a base64-encoded string or a valid URL"
      ),
    mimeType: z
      .enum(SUPPORTED_IMAGE_FORMATS)
      .optional()
      .describe(
        "Optional. The MIME type of the image (must be one of: 'image/jpeg', 'image/png', 'image/webp'). Required for base64 images."
      ),
  })
  .refine(
    (data) => {
      if (data.type === "base64" && !data.mimeType) {
        return false;
      }
      return true;
    },
    {
      message: "mimeType is required when using base64 image input",
      path: ["mimeType"],
    }
  )
  .refine(
    (data) => {
      if (data.type === "base64") {
        // Calculate base64 size in bytes (excluding header)
        const base64Data = data.data.split(",").pop() || "";
        const sizeInBytes = Math.round((base64Data.length * 3) / 4);
        return sizeInBytes <= 10 * 1024 * 1024; // 10MB limit
      }
      return true; // No size validation for URLs
    },
    {
      message: "Image size must not exceed 10MB",
      path: ["data"],
    }
  );

// Main parameters schema
export const GEMINI_OBJECT_DETECTION_PARAMS = z.object({
  modelName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional. The name of the Gemini model to use (e.g., 'gemini-1.5-pro'). If omitted, the server's default model will be used."
    ),
  image: ImageInputSchema.describe(
    "Required. The input image for object detection, either as base64-encoded data or a URL."
  ),
  promptAddition: z
    .string()
    .optional()
    .describe(
      "Optional. Additional instructions to customize the detection behavior (e.g., 'Focus on detecting electronic devices')."
    ),
  outputFormat: z
    .enum(["json", "text"])
    .default("json")
    .describe(
      "Optional. Format for the detection results. 'json' returns structured data, 'text' returns natural language description. Defaults to 'json'."
    ),
  safetySettings: z
    .array(safetySettingSchema)
    .optional()
    .describe(
      "Optional. A list of safety settings to apply, overriding default model safety settings. Each setting specifies a harm category and a blocking threshold."
    ),
});

// Type for parameter object using zod inference
export type GeminiObjectDetectionArgs = z.infer<
  typeof GEMINI_OBJECT_DETECTION_PARAMS
>;
