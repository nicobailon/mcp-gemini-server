import * as path from "path";
import { logger } from "../../utils/logger.js";

/**
 * Service for handling security-related operations for the Gemini service.
 * Primarily focuses on file path validation and secure base path management.
 */
export class GeminiSecurityService {
  private secureBasePath?: string;

  /**
   * Creates a new instance of the GeminiSecurityService.
   * @param secureBasePath Optional base path to restrict file operations to
   */
  constructor(secureBasePath?: string) {
    if (secureBasePath) {
      this.setSecureBasePath(secureBasePath);
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
        "File path must be within the configured secure base directory"
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
    logger.debug(`Secure base path set to: ${this.secureBasePath}`);
  }

  /**
   * Gets the current secure base directory if set
   */
  public getSecureBasePath(): string | undefined {
    return this.secureBasePath;
  }
}
