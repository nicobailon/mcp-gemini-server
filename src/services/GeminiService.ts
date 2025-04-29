import { GoogleGenAI } from "@google/genai";
import type {
  GenerationConfig,
  SafetySetting,
  Content,
  Part,
} from "@google/genai";
import { ConfigurationManager } from "../config/ConfigurationManager.js";
import { GeminiApiError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import path from "path";
import fs from "fs/promises";
import { FileMetadata } from "../types/index.js";

/**
 * Service for interacting with the Google Gemini API.
 */
export class GeminiService {
  private genAI: GoogleGenAI;
  private defaultModelName?: string;
  private secureBasePath?: string;

  constructor() {
    const configManager = ConfigurationManager.getInstance();
    const config = configManager.getGeminiServiceConfig();

    if (!config.apiKey) {
      throw new Error("Gemini API key is required");
    }

    this.genAI = new GoogleGenAI({ apiKey: config.apiKey });
    this.defaultModelName = config.defaultModel;

    // Set secure base path if configured
    const secureBasePath = configManager.getSecureFileBasePath();
    if (secureBasePath) {
      this.setSecureBasePath(secureBasePath);
      logger.info(
        `GeminiService initialized with secure file base path: ${secureBasePath}`
      );
    } else {
      logger.warn(
        "GeminiService initialized without a secure file base path. File operations will require explicit path validation."
      );
    }
  }

  /**
   * Uploads a file to be used with the Gemini API.
   * The file path is validated for security before reading.
   *
   * @param filePath The validated absolute path to the file
   * @param options Optional metadata like displayName and mimeType
   * @returns Promise resolving to file metadata including the name and URI
   */
  public async uploadFile(
    filePath: string,
    options?: { displayName?: string; mimeType?: string }
  ): Promise<FileMetadata> {
    // Validate file path (redundant if already validated in tool handler but safer)
    const validatedPath = this.validateFilePath(filePath);

    // Check if file exists
    try {
      await fs.access(validatedPath);
    } catch (error) {
      throw new GeminiApiError(`File not found: ${validatedPath}`, error);
    }

    // Implementation would call the Gemini API to upload the file
    // This is just a stub - actual implementation would use this.genAI.files.create

    logger.debug(`Uploading file from: ${validatedPath}`);
    logger.debug(`With options: ${JSON.stringify(options)}`);

    // Return mock file metadata for demonstration
    return {
      name: `files/${path.basename(validatedPath).replace(/\s+/g, "_")}`,
      uri: `https://api.gemini.com/v1/files/${Date.now()}`,
      mimeType: options?.mimeType || "application/octet-stream",
      displayName: options?.displayName,
      sizeBytes: "0",
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString(),
      sha256Hash: "mock-sha256-hash",
      state: "ACTIVE",
    };
  }

  public async generateContent(
    prompt: string,
    modelName?: string,
    generationConfig?: GenerationConfig,
    safetySettings?: SafetySetting[],
    systemInstruction?: Content,
    cachedContentName?: string,
    fileReferenceOrInlineData?: FileMetadata | string,
    inlineDataMimeType?: string
  ): Promise<string> {
    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiApiError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
      );
    }
    logger.debug(`generateContent called with model: ${effectiveModelName}`);

    // Construct base content parts array
    const contentParts: Part[] = [];
    contentParts.push({ text: prompt });

    // Add file reference or inline data if provided
    if (fileReferenceOrInlineData) {
      if (typeof fileReferenceOrInlineData === "string" && inlineDataMimeType) {
        // Handle inline base64 data
        contentParts.push({
          inlineData: {
            data: fileReferenceOrInlineData,
            mimeType: inlineDataMimeType,
          },
        });
      } else if (
        typeof fileReferenceOrInlineData === "object" &&
        "name" in fileReferenceOrInlineData &&
        fileReferenceOrInlineData.uri
      ) {
        // Handle file reference
        contentParts.push({
          fileData: {
            fileUri: fileReferenceOrInlineData.uri,
            mimeType: fileReferenceOrInlineData.mimeType,
          },
        });
      } else {
        throw new GeminiApiError(
          "Invalid file reference or inline data provided"
        );
      }
    }

    // Construct the config object
    const callConfig: Record<string, unknown> = {};
    if (generationConfig) {
      Object.assign(callConfig, { generationConfig });
    }
    if (safetySettings) {
      callConfig.safetySettings = safetySettings;
    }
    if (systemInstruction) {
      callConfig.systemInstruction = systemInstruction;
    }
    if (cachedContentName) {
      callConfig.cachedContent = cachedContentName;
    }

    // Create generate content parameters
    const params = {
      model: effectiveModelName,
      contents: [{ role: "user", parts: contentParts }],
      ...callConfig,
    };

    try {
      // Call generateContent with enhanced parameters
      const result = await this.genAI.models.generateContent(params);

      // In the new SDK, text is a property not a method
      if (result?.text) {
        return result.text;
      } else {
        // Fallback for unexpected structures
        logger.warn(
          "Unexpected result structure from generateContent:",
          result
        );
        return JSON.stringify(result);
      }
    } catch (error) {
      logger.error("Error generating content:", error);
      throw new GeminiApiError(
        `Failed to generate content: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Validates a file path to ensure it's secure.
   * This prevents path traversal attacks by ensuring paths:
   * 1. Are absolute
   * 2. Don't contain path traversal elements (../)
   * 3. Are within a permitted base directory (optional)
   *
   * @param filePath The absolute file path to validate
   * @param basePath Optional base path to restrict access to (if provided)
   * @returns The validated file path
   * @throws Error if the path is invalid or outside permitted boundaries
   */
  public validateFilePath(filePath: string, basePath?: string): string {
    // Ensure path is absolute
    if (!path.isAbsolute(filePath)) {
      throw new Error("File path must be absolute");
    }

    // Normalize path to resolve any . or .. segments
    const normalizedPath = path.normalize(filePath);

    // Check for path traversal attempts
    if (normalizedPath.includes("../") || normalizedPath.includes("..\\")) {
      throw new Error("Path contains invalid traversal sequences");
    }

    // If basePath is specified, ensure the path is within that directory
    if (basePath) {
      const normalizedBasePath = path.normalize(basePath);
      if (!normalizedPath.startsWith(normalizedBasePath)) {
        throw new Error(
          `File path must be within the allowed base directory: ${basePath}`
        );
      }
    }

    // If class has a secureBasePath set, also check against that
    if (
      this.secureBasePath &&
      !normalizedPath.startsWith(this.secureBasePath)
    ) {
      throw new Error(
        `File path must be within the configured secure base directory`
      );
    }

    return normalizedPath;
  }

  /**
   * Sets the secure base directory for file operations.
   * All file operations will be restricted to this directory.
   *
   * @param basePath The absolute path to restrict file operations to
   */
  public setSecureBasePath(basePath: string): void {
    if (!path.isAbsolute(basePath)) {
      throw new Error("Base path must be absolute");
    }

    // Store the base path in a private field
    this.secureBasePath = path.normalize(basePath);
  }

  /**
   * Gets the current secure base directory if set
   */
  public getSecureBasePath(): string | undefined {
    return this.secureBasePath;
  }

  // Other methods...
}
