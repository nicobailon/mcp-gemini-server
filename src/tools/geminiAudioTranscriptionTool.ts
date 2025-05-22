import * as fs from "fs";
import * as path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { GeminiService } from "../services/index.js";
import {
  GeminiApiError,
  ValidationError,
  mapToMcpError,
} from "../utils/errors.js";
import { logger, validateAndResolvePath } from "../utils/index.js";
import {
  TOOL_NAME_AUDIO_TRANSCRIPTION,
  TOOL_DESCRIPTION_AUDIO_TRANSCRIPTION,
  AudioTranscriptionParamsObject,
  AudioTranscriptionParams,
} from "./geminiAudioTranscriptionParams.js";

export function geminiAudioTranscriptionTool(server: McpServer) {
  // Get GeminiService instance
  const geminiService = new GeminiService();

  server.tool(
    TOOL_NAME_AUDIO_TRANSCRIPTION,
    TOOL_DESCRIPTION_AUDIO_TRANSCRIPTION,
    AudioTranscriptionParamsObject,
    async (params: AudioTranscriptionParams) => {
      let transcriptionResult;

      try {
        // Validate and resolve the file path to ensure it's secure
        const safeFilePath = validateAndResolvePath(params.filePath, {
          mustExist: true,
        });
        logger.info(`Using validated path: ${safeFilePath}`);

        // Determine MIME type
        let mimeType = params.mimeType;
        if (!mimeType) {
          const ext = path.extname(safeFilePath).toLowerCase();
          switch (ext) {
            case ".mp3":
              mimeType = "audio/mpeg";
              break;
            case ".wav":
              mimeType = "audio/wav";
              break;
            case ".ogg":
              mimeType = "audio/ogg";
              break;
            case ".m4a":
              mimeType = "audio/mp4";
              break;
            case ".flac":
              mimeType = "audio/flac";
              break;
            default:
              throw new Error(
                `Could not determine MIME type for extension '${ext}'. Please provide a 'mimeType' parameter or use a supported format (mp3, wav, ogg, m4a, flac).`
              );
          }
          logger.info(
            `Inferred MIME type ${mimeType} from file extension ${ext}.`
          );
        }

        // Check file size
        let fileStats;
        try {
          fileStats = fs.statSync(safeFilePath);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          throw new Error(`Failed to read file stats: ${errorMessage}`);
        }
        const fileSizeBytes = fileStats.size;
        const fileSizeMB = fileSizeBytes / (1024 * 1024);
        const SIZE_LIMIT_MB = 20;

        if (fileSizeMB > SIZE_LIMIT_MB) {
          logger.info(
            `Large audio file detected (${fileSizeMB.toFixed(2)}MB). Using File API for upload.`
          );

          try {
            const uploadedFile = await geminiService.uploadFile(safeFilePath, {
              mimeType,
            });
            logger.info(
              `File uploaded successfully. Name: ${uploadedFile.name}`
            );

            const promptParts = ["Transcribe this audio file accurately"];
            if (params.includeTimestamps) {
              promptParts.push(
                "include timestamps for each paragraph or speaker change"
              );
            }
            if (params.language) {
              promptParts.push(`the language is ${params.language}`);
            }
            if (params.prompt) {
              promptParts.push(params.prompt);
            }
            const prompt = promptParts.join(". ");

            // Use the geminiService defined at the top level

            // Call generateContent with compatible parameters
            transcriptionResult = await geminiService.generateContent({
              prompt,
              modelName: params.modelName,
              // Avoid passing uploadedFile which appears incompatible
              parts: [{ text: prompt }, { fileData: uploadedFile }],
            });
          } catch (error) {
            if (
              error instanceof Error &&
              error.message?.includes("File API is not supported")
            ) {
              const apiError = new Error(
                "Audio file exceeds 20MB limit for inline processing. The File API requires a Google AI Studio API key, which is not available or configured."
              );
              // Add details property so our mapper can use it
              // Enhanced error with more details
              const enhancedError = new Error(
                `Audio file exceeds 20MB limit for inline processing. The File API requires a Google AI Studio API key, which is not available or configured. Details: ${error instanceof Error ? error.message : String(error)}`
              );
              throw enhancedError;
            }
            throw error;
          }
        } else {
          logger.info(
            `Audio file size: ${fileSizeMB.toFixed(2)}MB. Processing directly with inline base64 data.`
          );

          try {
            const audioData = fs.readFileSync(safeFilePath);
            const audioBuffer = Buffer.from(audioData);
            const audioBase64 = audioBuffer.toString("base64");

            const promptParts = ["Transcribe this audio file accurately"];
            if (params.includeTimestamps) {
              promptParts.push(
                "include timestamps for each paragraph or speaker change"
              );
            }
            if (params.language) {
              promptParts.push(`the language is ${params.language}`);
            }
            if (params.prompt) {
              promptParts.push(params.prompt);
            }
            const prompt = promptParts.join(". ");

            // Use the geminiService defined at the top level

            // Call generateContent with compatible parameters
            transcriptionResult = await geminiService.generateContent({
              prompt,
              modelName: params.modelName,
              // Use parts array for audio data
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    data: audioBase64,
                    mimeType: mimeType,
                  },
                },
              ],
            });
          } catch (error) {
            if (error instanceof Error && error.message.includes("read file")) {
              const fileError = new ValidationError(
                `Failed to read audio file: ${error.message}`
              );
              // Instead of modifying details, create a new ValidationError with the details
              const newFileError = new ValidationError(
                `Failed to read audio file: ${error.message}. Path: ${safeFilePath}`
              );
              throw newFileError;
              throw fileError;
            }
            throw error;
          }
        }

        return transcriptionResult;
      } catch (error: unknown) {
        logger.error(
          `Error processing ${TOOL_NAME_AUDIO_TRANSCRIPTION} for file ${params.filePath || "unknown path"}:`,
          error
        );

        // Use the centralized error mapping utility to ensure consistent error handling
        throw mapToMcpError(error, TOOL_NAME_AUDIO_TRANSCRIPTION);
      }
    }
  );
}
