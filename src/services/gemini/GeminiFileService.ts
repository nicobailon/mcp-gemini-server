import { GoogleGenAI, File as GenAIFile } from "@google/genai";
import * as fs from "fs/promises";
import * as path from "path";
import { FileMetadata } from "../../types/index.js";
import {
  GeminiApiError,
  GeminiResourceNotFoundError,
  GeminiInvalidParameterError,
} from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { FileSecurityService } from "../../utils/FileSecurityService.js";
import { FileId } from "./GeminiTypes.js";

/**
 * Interface for the Gemini API list files response
 */
export interface ListFilesResponseType {
  files?: GenAIFile[];
  nextPageToken?: string;
  page?: Iterable<GenAIFile>;
  hasNextPage?: () => boolean;
}

/**
 * Service for handling file-related operations for the Gemini service.
 * Manages uploading, listing, retrieving, and deleting files.
 */
export class GeminiFileService {
  private genAI: GoogleGenAI;
  private fileSecurityService: FileSecurityService;

  /**
   * Creates a new instance of the GeminiFileService.
   * @param genAI The GoogleGenAI instance to use for API calls
   * @param fileSecurityService The security service for file path validation
   */
  constructor(genAI: GoogleGenAI, fileSecurityService: FileSecurityService) {
    this.genAI = genAI;
    this.fileSecurityService = fileSecurityService;
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
    const validatedPath =
      this.fileSecurityService.validateAndResolvePath(filePath);

    // Check if file exists
    try {
      await fs.access(validatedPath);
    } catch (error: unknown) {
      throw new GeminiApiError(`File not found: ${validatedPath}`, error);
    }

    try {
      logger.debug(`Uploading file from: ${validatedPath}`);
      logger.debug(`With options: ${JSON.stringify(options)}`);

      // Read the file data
      const fileBuffer = await fs.readFile(validatedPath);

      // Determine MIME type if not provided
      let mimeType = options?.mimeType;
      if (!mimeType) {
        // If mimeType is not provided, try to determine from file extension
        const ext = path.extname(validatedPath).toLowerCase();
        const mimeMap: Record<string, string> = {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".pdf": "application/pdf",
          ".txt": "text/plain",
        };
        mimeType = mimeMap[ext] || "application/octet-stream";
      }

      // Convert Buffer to Blob for v0.10.0 compatibility
      const blob = new Blob([fileBuffer], { type: mimeType });

      // Use the correct parameters for v0.10.0
      const uploadParams = {
        file: blob, // Use Blob instead of Buffer
        mimeType: mimeType,
        displayName: options?.displayName || path.basename(validatedPath),
      };

      // Upload the file using the files API
      const fileData = await this.genAI.files.upload(uploadParams);

      // Ensure required fields exist
      if (!fileData.name) {
        throw new GeminiApiError(
          "Invalid file data received: missing required name"
        );
      }

      // Return the file metadata
      return this.mapFileResponseToMetadata(fileData);
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

      // Prepare list parameters for v0.10.0
      const listParams: Record<string, number | string> = {};

      if (pageSize !== undefined) {
        listParams.pageSize = pageSize;
      }

      if (pageToken) {
        listParams.pageToken = pageToken;
      }

      // Call the files.list method in v0.10.0
      const response = await this.genAI.files.list(listParams);

      const files: FileMetadata[] = [];
      let nextPageToken: string | undefined;

      // Handle the response in a more generic way to accommodate different API versions
      if (response && typeof response === "object") {
        if ("files" in response && Array.isArray(response.files)) {
          // Standard response format
          for (const file of response.files) {
            files.push(this.mapFileResponseToMetadata(file));
          }
          // Use optional chaining to safely access nextPageToken
          nextPageToken = (response as ListFilesResponseType).nextPageToken;
        } else if ("page" in response && response.page) {
          // Pager-like object
          const fileList = Array.from(response.page);
          for (const file of fileList) {
            files.push(this.mapFileResponseToMetadata(file as GenAIFile));
          }

          // Check if there's a next page
          const hasNextPage =
            typeof response === "object" &&
            "hasNextPage" in response &&
            typeof response.hasNextPage === "function"
              ? response.hasNextPage()
              : false;

          if (hasNextPage) {
            nextPageToken = "next_page_available";
          }
        } else if (Array.isArray(response)) {
          // Direct array response
          for (const file of response) {
            files.push(this.mapFileResponseToMetadata(file as GenAIFile));
          }
        }
      }

      return { files, nextPageToken };
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
   * @param fileId The ID of the file to retrieve (format: "files/{file_id}")
   * @returns Promise resolving to the file metadata
   */
  public async getFile(fileId: FileId): Promise<FileMetadata> {
    try {
      logger.debug(`Getting file metadata for: ${fileId}`);

      // Validate the fileId format
      if (!fileId.startsWith("files/")) {
        throw new GeminiInvalidParameterError(
          `File ID must be in the format "files/{file_id}", received: ${fileId}`
        );
      }

      // Get the file metadata
      const fileData = await this.genAI.files.get({ name: fileId });

      return this.mapFileResponseToMetadata(fileData);
    } catch (error: unknown) {
      // Check for specific error patterns in the error message
      if (error instanceof Error) {
        if (
          error.message.includes("not found") ||
          error.message.includes("404")
        ) {
          throw new GeminiResourceNotFoundError("File", fileId, error);
        }
      }

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
   * @param fileId The ID of the file to delete (format: "files/{file_id}")
   * @returns Promise resolving to an object with success flag
   */
  public async deleteFile(fileId: FileId): Promise<{ success: boolean }> {
    try {
      logger.debug(`Deleting file: ${fileId}`);

      // Validate the fileId format
      if (!fileId.startsWith("files/")) {
        throw new GeminiInvalidParameterError(
          `File ID must be in the format "files/{file_id}", received: ${fileId}`
        );
      }

      // Delete the file
      await this.genAI.files.delete({ name: fileId });

      return { success: true };
    } catch (error: unknown) {
      // Check for specific error patterns in the error message
      if (error instanceof Error) {
        if (
          error.message.includes("not found") ||
          error.message.includes("404")
        ) {
          throw new GeminiResourceNotFoundError("File", fileId, error);
        }
      }

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
    if (!fileData.name) {
      throw new Error("Invalid file data received: missing required name");
    }

    // In SDK v0.10.0, the structure might be slightly different
    // Constructing FileMetadata with fallback values where needed
    return {
      name: fileData.name,
      // Provide a fallback URI from name if not present (format may vary in v0.10.0)
      uri:
        fileData.uri ||
        `https://generativelanguage.googleapis.com/v1beta/${fileData.name}`,
      mimeType: fileData.mimeType || "application/octet-stream",
      displayName: fileData.displayName,
      sizeBytes: fileData.sizeBytes || 0,
      createTime: fileData.createTime || new Date().toISOString(),
      updateTime: fileData.updateTime || new Date().toISOString(),
      expirationTime: fileData.expirationTime,
      sha256Hash: fileData.sha256Hash || "",
      state: fileData.state || "ACTIVE",
    };
  }
}
