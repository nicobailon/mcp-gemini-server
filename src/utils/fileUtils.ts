import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "./logger.js";

/**
 * Securely writes content to a file, ensuring the path is within allowed directories.
 *
 * @param filePath - The relative or absolute path to the file.
 * @param content - The string content to write to the file.
 * @param allowedAbsolutePaths - An array of absolute paths (directories or files) that are permitted for writing.
 * @returns A promise that resolves when the file is written, or rejects on error/validation failure.
 * @throws Error if the filePath is outside the allowedPaths or if any file system operation fails.
 */
export async function secureWriteFile(
  filePath: string,
  content: string,
  allowedAbsolutePaths: string[]
): Promise<void> {
  // 1. Resolve filePath to an absolute path to cannonicalize it.
  const resolvedFilePath = path.resolve(filePath);

  // 2. Normalize the resolved path to handle sequences like '..'.
  const normalizedFilePath = path.normalize(resolvedFilePath);

  // 3. Security Check: Ensure the normalized path is within one of the allowedAbsolutePaths.
  let isAllowed = false;
  for (const allowedPath of allowedAbsolutePaths) {
    const normalizedAllowedPath = path.normalize(allowedPath);
    // Check if it's an allowed directory containing the file, or an exact file match.
    if (
      normalizedFilePath.startsWith(normalizedAllowedPath + path.sep) ||
      normalizedFilePath === normalizedAllowedPath
    ) {
      // Additional check: ensure no upward traversal *after* matching the prefix.
      // This is mostly handled by path.resolve and path.normalize, but an explicit check on the final path is good.
      // The key is that `normalizedFilePath` must truly be a descendant of `normalizedAllowedPath` (if it's a directory)
      // or an exact match.
      // A robust way to check if A is a child of B (or B itself):
      // path.relative(normalizedAllowedPath, normalizedFilePath) must not start with '..' and must not be an absolute path itself (if it starts with / or drive letter)
      const relativePath = path.relative(
        normalizedAllowedPath,
        normalizedFilePath
      );
      if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
        isAllowed = true;
        break;
      }
    }
  }

  if (!isAllowed) {
    logger.error(
      `Path traversal attempt or disallowed path: ${filePath} (resolved to ${normalizedFilePath})`
    );
    throw new Error(
      `File path '${filePath}' is not within the allowed output locations.`
    );
  }

  // 4. Create parent directories if they don't exist.
  const dirname = path.dirname(normalizedFilePath);
  try {
    await fs.mkdir(dirname, { recursive: true });
  } catch (err: any) {
    logger.error(`Error creating directory ${dirname}:`, err);
    throw new Error(
      `Failed to create directory structure for ${filePath}: ${err.message}`
    );
  }

  // 5. Write the file.
  try {
    await fs.writeFile(normalizedFilePath, content, "utf8");
    logger.info(`Successfully wrote file to ${normalizedFilePath}`);
  } catch (err: any) {
    logger.error(`Error writing file ${normalizedFilePath}:`, err);
    throw new Error(`Failed to write file ${filePath}: ${err.message}`);
  }
}
