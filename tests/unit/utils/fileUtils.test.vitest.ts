import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";

// Import the code to test
import { secureWriteFile } from "../../../src/utils/fileUtils.js";
import { logger } from "../../../src/utils/logger.js";

describe("fileUtils", () => {
  // Define test constants for all tests
  const TEST_CONTENT = "Test file content";

  // Test directories for our tests
  const testDir = path.resolve("./test-temp-dir");
  const subDir = path.join(testDir, "sub-dir");
  const outsideDir = path.resolve("./outside-dir");
  const ALLOWED_DIR = path.join(testDir, "allowed");

  // Setup and teardown for tests
  beforeEach(async () => {
    // Setup test directories
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(ALLOWED_DIR, { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });

    // Mock logger to prevent console spam
    vi.spyOn(logger, "info").mockImplementation(vi.fn());
    vi.spyOn(logger, "error").mockImplementation(vi.fn());
    vi.spyOn(logger, "warn").mockImplementation(vi.fn());
  });

  afterEach(async () => {
    // Clean up test directories
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(outsideDir, { recursive: true, force: true });

    // Restore mocks
    vi.restoreAllMocks();
  });

  describe("Functional Tests", () => {
    it("should write to a file directly within allowed absolute directory", async () => {
      // Arrange
      const filePath = path.join(ALLOWED_DIR, "file.txt");
      const allowedPaths = [ALLOWED_DIR];

      // Act
      await secureWriteFile(filePath, TEST_CONTENT, allowedPaths);

      // Assert
      const fileContent = await fs.readFile(filePath, "utf8");
      expect(fileContent).toBe(TEST_CONTENT);
    });

    it("should write to a file in a nested subdirectory of allowed directory", async () => {
      // Arrange
      const nestedDir = path.join(ALLOWED_DIR, "subdir");
      const filePath = path.join(nestedDir, "file.txt");
      const allowedPaths = [ALLOWED_DIR];

      // Act
      await secureWriteFile(filePath, TEST_CONTENT, allowedPaths);

      // Assert
      const fileContent = await fs.readFile(filePath, "utf8");
      expect(fileContent).toBe(TEST_CONTENT);
    });

    it("should allow writing when filePath is an exact match to allowed absolute file path", async () => {
      // Arrange
      const exactFilePath = path.join(ALLOWED_DIR, "exact-file.txt");
      const allowedPaths = [exactFilePath]; // Allowing the exact file path

      // Act
      await secureWriteFile(exactFilePath, TEST_CONTENT, allowedPaths);

      // Assert
      const fileContent = await fs.readFile(exactFilePath, "utf8");
      expect(fileContent).toBe(TEST_CONTENT);
    });

    it("should throw error when filePath resolves outside allowed paths", async () => {
      // Arrange
      const unsafePath = path.join(outsideDir, "unsafe-file.txt");
      const allowedPaths = [ALLOWED_DIR];

      // Act & Assert
      await expect(
        secureWriteFile(unsafePath, TEST_CONTENT, allowedPaths)
      ).rejects.toThrow(/not within the allowed output locations/);

      // Additional check that logger.error was called
      expect(logger.error).toHaveBeenCalled();

      // Verify file was not written
      await expect(fs.access(unsafePath)).rejects.toThrow();
    });

    it("should throw error when filePath uses directory traversal to escape allowed path", async () => {
      // Arrange
      const traversalPath = path.join(
        ALLOWED_DIR,
        "subdir",
        "..",
        "..",
        "outside",
        "file.txt"
      );
      const allowedPaths = [ALLOWED_DIR];

      // Act & Assert
      await expect(
        secureWriteFile(traversalPath, TEST_CONTENT, allowedPaths)
      ).rejects.toThrow(/not within the allowed output locations/);
    });

    it("should throw error when no allowed paths are provided", async () => {
      // Arrange
      const filePath = path.join(ALLOWED_DIR, "file.txt");
      const allowedPaths: string[] = [];

      // Act & Assert
      await expect(
        secureWriteFile(filePath, TEST_CONTENT, allowedPaths)
      ).rejects.toThrow(/not within the allowed output locations/);
    });

    it("should correctly handle path normalization and resolution", async () => {
      // Arrange
      const complexPath = path.join(
        ALLOWED_DIR,
        ".",
        "subdir",
        "..",
        "normalized-file.txt"
      );
      const allowedPaths = [ALLOWED_DIR];

      // Act
      await secureWriteFile(complexPath, TEST_CONTENT, allowedPaths);

      // Assert - check the file exists at the normalized location
      const expectedPath = path.join(ALLOWED_DIR, "normalized-file.txt");
      const fileContent = await fs.readFile(expectedPath, "utf8");
      expect(fileContent).toBe(TEST_CONTENT);
    });

    it("should handle multiple allowed paths", async () => {
      // Arrange
      const filePath = path.join(outsideDir, "allowed-outside-file.txt");
      const content = "multi-allowed content";

      // Act
      await secureWriteFile(filePath, content, [ALLOWED_DIR, outsideDir]);

      // Assert
      const fileContent = await fs.readFile(filePath, "utf8");
      expect(fileContent).toBe(content);
    });
  });
});
