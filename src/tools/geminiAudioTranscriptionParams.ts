// Audio Transcription Parameters for Gemini SDK

import { z } from "zod";

// Tool constants
export const TOOL_NAME_AUDIO_TRANSCRIPTION = "gemini_audioTranscription";
export const TOOL_DESCRIPTION_AUDIO_TRANSCRIPTION = "Transcribes audio files using Gemini 2.5 models. Supports various audio formats and can include timestamps, language specification, and custom prompts. Handles both direct processing (files <20MB) and File API processing (files up to 2GB with Google AI Studio API key).";

// Supported audio formats
export const SUPPORTED_AUDIO_FORMATS = [
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/flac",
  "audio/x-flac"
] as const;

// Parameter schema definitions
export const AudioTranscriptionParamsObject = {
  filePath: z.string({
    description: "Absolute path to the audio file. Must be accessible by the server process.",
    required_error: "filePath is required",
    invalid_type_error: "filePath must be a string"
  }),
  modelName: z.string({
    description: "Compatible Gemini 2.5 model to use for transcription. Example: 'gemini-2.5-pro'"
  }).optional(),
  includeTimestamps: z.boolean({
    description: "Whether to include timestamps in the transcription output"
  }).default(false),
  language: z.string({
    description: "BCP-47 language code (e.g., 'en-US', 'fr-FR') to optimize transcription for a specific language"
  }).optional(),
  prompt: z.string({
    description: "Additional instructions to guide the transcription process"
  }).optional(),
  mimeType: z.enum(SUPPORTED_AUDIO_FORMATS, {
    description: "Audio file MIME type. Recommended to provide for accurate processing."
  }).optional()
};

// Combined schema with strict type checking
export const CombinedSchema = z.object(AudioTranscriptionParamsObject).strict();

// Type definition for parameters
export type AudioTranscriptionParams = z.infer<typeof CombinedSchema>;

// Export the schema
export const AudioTranscriptionParamsSchema = CombinedSchema;