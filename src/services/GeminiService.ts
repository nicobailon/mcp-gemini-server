import { GoogleGenAI } from "@google/genai";
import type {
  GenerationConfig,
  SafetySetting,
  Content,
  Part,
  File as GenAIFile,
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

    try {
      logger.debug(`Uploading file from: ${validatedPath}`);
      logger.debug(`With options: ${JSON.stringify(options)}`);

      // Prepare upload configuration
      const uploadConfig: {
        file: string;
        config?: {
          mimeType?: string;
          displayName?: string;
        };
      } = {
        file: validatedPath,
      };

      if (options) {
        uploadConfig.config = {};
        if (options.mimeType) {
          uploadConfig.config.mimeType = options.mimeType;
        }
        if (options.displayName) {
          uploadConfig.config.displayName = options.displayName;
        }
      }

      // Upload the file
      const fileData = await this.genAI.files.upload(uploadConfig);

      // Ensure required fields exist
      if (!fileData.name || !fileData.uri) {
        throw new GeminiApiError(
          "Invalid file data received: missing required name or uri"
        );
      }

      // Return the file metadata
      return {
        name: fileData.name,
        uri: fileData.uri,
        mimeType:
          fileData.mimeType || options?.mimeType || "application/octet-stream",
        displayName: fileData.displayName || options?.displayName,
        sizeBytes: fileData.sizeBytes || "0",
        createTime: fileData.createTime || new Date().toISOString(),
        updateTime: fileData.updateTime || new Date().toISOString(),
        sha256Hash: fileData.sha256Hash || "",
        state: fileData.state || "ACTIVE",
      };
    } catch (error: unknown) {
      logger.error(
        `Error uploading file: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to upload file: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Lists files that have been uploaded to the Gemini API.
   *
   * @param pageSize Optional maximum number of files to return
   * @param pageToken Optional token for pagination
   * @returns Promise resolving to an object with files array and optional nextPageToken
   */
  public async listFiles(
    pageSize?: number,
    pageToken?: string
  ): Promise<{ files: FileMetadata[]; nextPageToken?: string }> {
    try {
      logger.debug(
        `Listing files with pageSize: ${pageSize}, pageToken: ${pageToken}`
      );

      // Call the files.list method
      const pager = await this.genAI.files.list({
        config: {
          pageSize: pageSize,
          pageToken: pageToken,
        },
      });

      // Get the first page of results
      const page = pager.page;
      const files: FileMetadata[] = [];

      // Process each file in the page
      for (const file of page) {
        files.push(this.mapFileResponseToMetadata(file));
      }

      // Determine if there's another page of results
      const hasNextPage = pager.hasNextPage();

      // Return the files and the nextPageToken if available
      return {
        files,
        nextPageToken: hasNextPage ? "next_page_available" : undefined,
      };
    } catch (error: unknown) {
      logger.error(
        `Error listing files: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to list files: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Gets a specific file's metadata from the Gemini API.
   *
   * @param fileName The name of the file to retrieve (format: "files/{file_id}")
   * @returns Promise resolving to the file metadata
   */
  public async getFile(fileName: string): Promise<FileMetadata> {
    try {
      logger.debug(`Getting file metadata for: ${fileName}`);

      // Get the file metadata
      const fileData = await this.genAI.files.get({ name: fileName });

      return this.mapFileResponseToMetadata(fileData);
    } catch (error: unknown) {
      logger.error(
        `Error getting file: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to get file: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Deletes a file from the Gemini API.
   *
   * @param fileName The name of the file to delete (format: "files/{file_id}")
   * @returns Promise resolving to an object with success flag
   */
  public async deleteFile(fileName: string): Promise<{ success: boolean }> {
    try {
      logger.debug(`Deleting file: ${fileName}`);

      // Delete the file
      await this.genAI.files.delete({ name: fileName });

      return { success: true };
    } catch (error: unknown) {
      logger.error(
        `Error deleting file: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to delete file: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Helper method to map file response data to our FileMetadata interface
   *
   * @param fileData The file data from the Gemini API
   * @returns The mapped FileMetadata object
   */
  private mapFileResponseToMetadata(fileData: GenAIFile): FileMetadata {
    if (!fileData.name || !fileData.uri) {
      throw new Error(
        "Invalid file data received: missing required name or uri"
      );
    }

    return {
      name: fileData.name!,
      uri: fileData.uri!,
      mimeType: fileData.mimeType || "application/octet-stream",
      displayName: fileData.displayName,
      sizeBytes: fileData.sizeBytes || "0",
      createTime: fileData.createTime || new Date().toISOString(),
      updateTime: fileData.updateTime || new Date().toISOString(),
      expirationTime: fileData.expirationTime,
      sha256Hash: fileData.sha256Hash || "",
      state: fileData.state || "ACTIVE",
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
}
