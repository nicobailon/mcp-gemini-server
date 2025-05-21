import * as path from "path";
import { logger } from "../../utils/logger.js";
import { FileSecurityService } from "../../utils/FileSecurityService.js";
import { ValidationError } from "../../utils/errors.js";

/**
 * Service for handling security-related operations for the Gemini service.
 * Primarily focuses on file path validation and secure base path management.
 * Uses the centralized FileSecurityService for consistent path validation.
 * 
 * @deprecated Use FileSecurityService directly instead
 */
export class GeminiSecurityService {
  private fileSecurityService: FileSecurityService;

  /**
   * Creates a new instance of the GeminiSecurityService.
   * @param secureBasePath Optional base path to restrict file operations to
   */
  constructor(secureBasePath?: string) {
    // Initialize with FileSecurityService
    this.fileSecurityService = new FileSecurityService(
      secureBasePath ? [secureBasePath] : undefined,
      secureBasePath
    );
    
    if (secureBasePath) {
      logger.debug(`GeminiSecurityService initialized with base path: ${secureBasePath}`);
    } else {
      logger.debug(`GeminiSecurityService initialized with default base path`);
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
    try {
      return this.fileSecurityService.validateAndResolvePath(filePath, {
        basePath: basePath
      });
    } catch (error) {
      // Convert ValidationError to regular Error for backward compatibility
      if (error instanceof ValidationError) {
        throw new Error(error.message);
      }
      throw error;
    }
  }

  /**
   * Sets the secure base directory for file operations.
   * All file operations will be restricted to this directory.
   *
   * @param basePath The absolute path to restrict file operations to
   */
  public setSecureBasePath(basePath: string): void {
    try {
      this.fileSecurityService.setSecureBasePath(basePath);
      logger.debug(`Secure base path set to: ${basePath}`);
    } catch (error) {
      // Convert ValidationError to regular Error for backward compatibility
      if (error instanceof ValidationError) {
        throw new Error(error.message);
      }
      throw error;
    }
  }

  /**
   * Gets the current secure base directory if set
   */
  public getSecureBasePath(): string | undefined {
    return this.fileSecurityService.getSecureBasePath();
  }
  
  /**
   * Gets the underlying FileSecurityService instance
   * This allows for a gradual transition to the new service
   */
  public getFileSecurityService(): FileSecurityService {
    return this.fileSecurityService;
  }
}
