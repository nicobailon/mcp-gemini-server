import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "./logger.js";

/**
 * Checks if a given file path is within any of the allowed directories.
 *
 * @param filePath - The relative or absolute path to check.
 * @param allowedDirs - An array of allowed directory paths.
 * @returns True if the file path is within any of the allowed directories, false otherwise.
 */
export function isPathWithinAllowedDirs(
  filePath: string,
  allowedDirs: string[]
): boolean {
  // Return false if allowedDirs is empty or undefined
  if (!allowedDirs || allowedDirs.length === 0) {
    return false;
  }

  // Canonicalize the file path to an absolute path
  const resolvedFilePath = path.resolve(filePath);

  // Normalize the path to handle sequences like '..'
  const normalizedFilePath = path.normalize(resolvedFilePath);

  // Check if the file path is within any of the allowed directories
  for (const allowedDir of allowedDirs) {
    // Normalize the allowed directory path
    const normalizedAllowedDir = path.normalize(path.resolve(allowedDir));

    // Check if it's an allowed directory containing the file, or an exact match
    if (
      normalizedFilePath.startsWith(normalizedAllowedDir + path.sep) ||
      normalizedFilePath === normalizedAllowedDir
    ) {
      // Additional check: ensure no upward traversal after matching the prefix
      const relativePath = path.relative(
        normalizedAllowedDir,
        normalizedFilePath
      );

      if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Securely writes content to a file, ensuring the path is within allowed directories.
 *
 * @param filePath - The relative or absolute path to the file.
 * @param content - The string content to write to the file.
 * @param allowedDirs - An array of absolute paths (directories or files) that are permitted for writing.
 * @param overwrite - Whether to overwrite the file if it already exists (default: false).
 * @returns A promise that resolves when the file is written, or rejects on error/validation failure.
 * @throws Error if the filePath is outside the allowedPaths, if the file exists and overwrite is false, or if any file system operation fails.
 */
export async function secureWriteFile(
  filePath: string,
  content: string,
  allowedDirs: string[],
  overwrite = false
): Promise<void> {
  // 1. Security Check: Validate the path is within allowed directories
  if (!isPathWithinAllowedDirs(filePath, allowedDirs)) {
    logger.error(
      `Path traversal attempt or disallowed path: ${filePath} (resolved to ${path.resolve(filePath)})`
    );
    throw new Error(
      `File path '${filePath}' is not within the allowed output locations.`
    );
  }

  // 2. Canonicalize the path
  const normalizedFilePath = path.normalize(path.resolve(filePath));

  // 3. Check if file exists and overwrite flag is false
  if (!overwrite) {
    try {
      await fs.access(normalizedFilePath);
      // If we get here, the file exists
      logger.error(
        `File already exists and overwrite is false: ${normalizedFilePath}`
      );
      throw new Error(
        `File already exists: ${filePath}. Set overwrite flag to true to replace it.`
      );
    } catch (err: any) {
      // File doesn't exist or other access error - this is what we want for creating new files
      if (err.code !== "ENOENT") {
        // If error is not "file doesn't exist", it's another access error
        logger.error(
          `Error checking file existence for ${normalizedFilePath}:`,
          err
        );
        throw new Error(`Error checking file access: ${err.message}`);
      }
      // If err.code === 'ENOENT', the file doesn't exist, which is fine for creating a new file
    }
  }

  // 4. Create parent directories if they don't exist
  const dirname = path.dirname(normalizedFilePath);
  try {
    await fs.mkdir(dirname, { recursive: true });
  } catch (err: any) {
    logger.error(`Error creating directory ${dirname}:`, err);
    throw new Error(
      `Failed to create directory structure for ${filePath}: ${err.message}`
    );
  }

  // 5. Write the file
  try {
    await fs.writeFile(normalizedFilePath, content, "utf8");
    logger.info(`Successfully wrote file to ${normalizedFilePath}`);
  } catch (err: any) {
    logger.error(`Error writing file ${normalizedFilePath}:`, err);
    throw new Error(`Failed to write file ${filePath}: ${err.message}`);
  }
}
