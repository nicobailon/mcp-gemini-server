import * as fs from "fs";
import * as path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { GeminiService } from "../services/index.js";
import { GeminiApiError, ValidationError } from "../utils/errors.js";
import { logger, validateAndResolvePath } from "../utils/index.js";
import {
  TOOL_NAME_AUDIO_TRANSCRIPTION,
  TOOL_DESCRIPTION_AUDIO_TRANSCRIPTION,
  AudioTranscriptionParamsObject,
  AudioTranscriptionParams,
} from "./geminiAudioTranscriptionParams.js";

export function geminiAudioTranscriptionTool(
  server: McpServer,
  geminiService: GeminiService
) {
  server.tool({
    name: TOOL_NAME_AUDIO_TRANSCRIPTION,
    description: TOOL_DESCRIPTION_AUDIO_TRANSCRIPTION,
    parameters: AudioTranscriptionParamsObject,
    handler: async (params: AudioTranscriptionParams) => {
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
              throw new McpError(
                ErrorCode.InvalidParams,
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
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to read file stats: ${error.message}`,
            { path: safeFilePath }
          );
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

            transcriptionResult = await geminiService.generateContent(
              prompt,
              params.modelName,
              undefined,
              undefined,
              undefined,
              undefined,
              uploadedFile
            );
          } catch (error) {
            if (error.message?.includes("File API is not supported")) {
              throw new McpError(
                ErrorCode.FailedPrecondition,
                "Audio file exceeds 20MB limit for inline processing. The File API requires a Google AI Studio API key, which is not available or configured.",
                { fileSizeMB, error: error.message }
              );
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

            transcriptionResult = await geminiService.generateContent(
              prompt,
              params.modelName,
              undefined,
              undefined,
              undefined,
              undefined,
              audioBase64,
              mimeType
            );
          } catch (error) {
            if (error instanceof Error && error.message.includes("read file")) {
              throw new McpError(
                ErrorCode.InvalidParams,
                `Failed to read audio file: ${error.message}`,
                { path: safeFilePath }
              );
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

        if (error instanceof ValidationError) {
          // Handle file path validation errors
          throw new McpError(
            ErrorCode.InvalidParams,
            `File validation error: ${error.message}`,
            { cause: "path_validation_failed" }
          );
        } else if (error instanceof GeminiApiError) {
          if (
            error.message.includes("safety settings") ||
            error.message.includes("blocked")
          ) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Audio content blocked by safety settings: ${error.message}`,
              error.details
            );
          }
          if (
            error.message.includes("quota") ||
            error.message.includes("rate limit")
          ) {
            throw new McpError(
              ErrorCode.ResourceExhausted,
              `API quota or rate limit exceeded: ${error.message}`,
              error.details
            );
          }
          if (error.message.includes("File API is not supported")) {
            throw new McpError(
              ErrorCode.FailedPrecondition,
              "This operation requires the Gemini File API, which is only available with a Google AI Studio API key, not Vertex AI.",
              error.details
            );
          }
          throw new McpError(
            ErrorCode.InternalError,
            `Gemini API Error: ${error.message}`,
            error.details
          );
        } else if (error instanceof McpError) {
          throw error;
        } else {
          throw new McpError(
            ErrorCode.InternalError,
            `An unexpected error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
            error
          );
        }
      }
    },
  });
}
