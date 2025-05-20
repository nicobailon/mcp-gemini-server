import { describe, it, beforeEach, after, mock } from "node:test";
import * as assert from "node:assert";
import * as path from "node:path";
import * as fs from "node:fs/promises";

// Import the code to test
import { secureWriteFile } from "../../../src/utils/fileUtils.js";
import { logger } from "../../../src/utils/logger.js";

describe("fileUtils", () => {
  // Two testing approaches:
  // 1. Mock-based unit tests focusing purely on the function logic
  // 2. Integration tests that actually interact with the file system

  // Define test constants for all tests
  const TEST_CONTENT = "Test file content";

  describe("Unit Tests with Mocks", () => {
    // Mock fs.promises methods
    const fsMock = {
      mkdir: mock.fn(),
      writeFile: mock.fn()
    };

    // Mock logger
    const loggerMock = {
      info: mock.fn(),
      error: mock.fn()
    };

    // Define test constants specific to mock tests
    const ALLOWED_DIR = "/test/allowed";

    // Setup before each test
    beforeEach(() => {
      // Reset mock calls
      fsMock.mkdir.mock.resetCalls();
      fsMock.writeFile.mock.resetCalls();
      loggerMock.info.mock.resetCalls();
      loggerMock.error.mock.resetCalls();
      
      // Set default successful responses
      fsMock.mkdir.mock.mockImplementation(() => Promise.resolve());
      fsMock.writeFile.mock.mockImplementation(() => Promise.resolve());
      
      // Replace the real fs methods with mocks for these tests
      // Save original methods to restore later
      const originalMkdir = fs.mkdir;
      const originalWriteFile = fs.writeFile;
      const originalLoggerInfo = logger.info;
      const originalLoggerError = logger.error;
      
      // Replace with mocks
      fs.mkdir = fsMock.mkdir as any;
      fs.writeFile = fsMock.writeFile as any;
      logger.info = loggerMock.info as any;
      logger.error = loggerMock.error as any;
      
      // Restore after test
      after(() => {
        fs.mkdir = originalMkdir;
        fs.writeFile = originalWriteFile;
        logger.info = originalLoggerInfo;
        logger.error = originalLoggerError;
      });
    });

    it("should write to a file directly within allowed absolute directory", async () => {
      // Arrange
      const filePath = path.join(ALLOWED_DIR, "file.txt");
      const allowedPaths = [ALLOWED_DIR];
      
      // Act
      await secureWriteFile(filePath, TEST_CONTENT, allowedPaths);
      
      // Assert
      assert.equal(fsMock.mkdir.mock.callCount(), 1, "mkdir should be called once");
      assert.equal(fsMock.writeFile.mock.callCount(), 1, "writeFile should be called once");
      
      // Check correct paths were used
      const mkdirArgs = fsMock.mkdir.mock.calls[0].arguments;
      assert.equal(mkdirArgs[0], ALLOWED_DIR, "mkdir should be called with correct dirname");
      assert.deepEqual(mkdirArgs[1], { recursive: true }, "mkdir should use recursive option");
      
      const writeFileArgs = fsMock.writeFile.mock.calls[0].arguments;
      assert.equal(writeFileArgs[0], path.resolve(filePath), "writeFile should use normalized path");
      assert.equal(writeFileArgs[1], TEST_CONTENT, "writeFile should use correct content");
      assert.equal(writeFileArgs[2], "utf8", "writeFile should use utf8 encoding");
    });

    it("should write to a file in a nested subdirectory of allowed directory", async () => {
      // Arrange
      const nestedDir = path.join(ALLOWED_DIR, "subdir");
      const filePath = path.join(nestedDir, "file.txt");
      const allowedPaths = [ALLOWED_DIR];
      
      // Act
      await secureWriteFile(filePath, TEST_CONTENT, allowedPaths);
      
      // Assert
      assert.equal(fsMock.mkdir.mock.callCount(), 1, "mkdir should be called once");
      assert.equal(fsMock.writeFile.mock.callCount(), 1, "writeFile should be called once");
      
      // Check mkdir called with correct path
      const mkdirArgs = fsMock.mkdir.mock.calls[0].arguments;
      assert.equal(mkdirArgs[0], path.dirname(path.resolve(filePath)), "mkdir should create nested directory");
      assert.deepEqual(mkdirArgs[1], { recursive: true }, "mkdir should use recursive option");
    });

    it("should allow writing when filePath is an exact match to allowed absolute file path", async () => {
      // Arrange
      const exactFilePath = path.join(ALLOWED_DIR, "exact-file.txt");
      const allowedPaths = [exactFilePath]; // Allowing the exact file path
      
      // Act
      await secureWriteFile(exactFilePath, TEST_CONTENT, allowedPaths);
      
      // Assert
      assert.equal(fsMock.mkdir.mock.callCount(), 1, "mkdir should be called once");
      assert.equal(fsMock.writeFile.mock.callCount(), 1, "writeFile should be called once");
    });

    it("should throw error when filePath resolves outside allowed paths", async () => {
      // Arrange
      const unsafePath = "/unsafe/file.txt";
      const allowedPaths = [ALLOWED_DIR];
      
      // Act & Assert
      await assert.rejects(
        async () => await secureWriteFile(unsafePath, TEST_CONTENT, allowedPaths),
        (err) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes("not within the allowed output locations"));
          assert.equal(loggerMock.error.mock.callCount(), 1, "Error should be logged");
          return true;
        }
      );
      
      // Verify no file operations were attempted
      assert.equal(fsMock.mkdir.mock.callCount(), 0, "mkdir should not be called");
      assert.equal(fsMock.writeFile.mock.callCount(), 0, "writeFile should not be called");
    });

    it("should throw error when filePath uses directory traversal to escape allowed path", async () => {
      // Arrange
      const traversalPath = path.join(ALLOWED_DIR, "subdir", "..", "..", "unsafe", "file.txt");
      const allowedPaths = [ALLOWED_DIR];
      
      // Act & Assert
      await assert.rejects(
        async () => await secureWriteFile(traversalPath, TEST_CONTENT, allowedPaths),
        (err) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes("not within the allowed output locations"));
          return true;
        }
      );
      
      // Verify no file operations were attempted
      assert.equal(fsMock.mkdir.mock.callCount(), 0, "mkdir should not be called");
      assert.equal(fsMock.writeFile.mock.callCount(), 0, "writeFile should not be called");
    });

    it("should throw error when no allowed paths are provided", async () => {
      // Arrange
      const filePath = path.join(ALLOWED_DIR, "file.txt");
      const allowedPaths: string[] = [];
      
      // Act & Assert
      await assert.rejects(
        async () => await secureWriteFile(filePath, TEST_CONTENT, allowedPaths),
        (err) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes("not within the allowed output locations"));
          return true;
        }
      );
    });

    it("should throw error when mkdir fails", async () => {
      // Arrange
      const filePath = path.join(ALLOWED_DIR, "file.txt");
      const allowedPaths = [ALLOWED_DIR];
      const mkdirError = new Error("Failed to create directory");
      
      // Mock mkdir to reject
      fsMock.mkdir.mock.mockImplementation(() => Promise.reject(mkdirError));
      
      // Act & Assert
      await assert.rejects(
        async () => await secureWriteFile(filePath, TEST_CONTENT, allowedPaths),
        (err) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes("Failed to create directory structure"));
          assert.ok(err.message.includes(mkdirError.message));
          assert.equal(loggerMock.error.mock.callCount(), 1, "Error should be logged");
          return true;
        }
      );
      
      // Verify mkdir was called but writeFile was not
      assert.equal(fsMock.mkdir.mock.callCount(), 1, "mkdir should be called once");
      assert.equal(fsMock.writeFile.mock.callCount(), 0, "writeFile should not be called");
    });

    it("should throw error when writeFile fails", async () => {
      // Arrange
      const filePath = path.join(ALLOWED_DIR, "file.txt");
      const allowedPaths = [ALLOWED_DIR];
      const writeError = new Error("Failed to write file");
      
      // Mock writeFile to reject
      fsMock.writeFile.mock.mockImplementation(() => Promise.reject(writeError));
      
      // Act & Assert
      await assert.rejects(
        async () => await secureWriteFile(filePath, TEST_CONTENT, allowedPaths),
        (err) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes("Failed to write file"));
          assert.ok(err.message.includes(writeError.message));
          assert.equal(loggerMock.error.mock.callCount(), 1, "Error should be logged");
          return true;
        }
      );
      
      // Verify mkdir was called but writeFile fails
      assert.equal(fsMock.mkdir.mock.callCount(), 1, "mkdir should be called once");
      assert.equal(fsMock.writeFile.mock.callCount(), 1, "writeFile should be called once");
    });

    it("should correctly handle path normalization and resolution", async () => {
      // Arrange
      const complexPath = path.join(ALLOWED_DIR, ".", "subdir", "..", "file.txt");
      const allowedPaths = [ALLOWED_DIR];
      
      // Act
      await secureWriteFile(complexPath, TEST_CONTENT, allowedPaths);
      
      // Assert
      assert.equal(fsMock.writeFile.mock.callCount(), 1, "writeFile should be called once");
      
      // Get resolved normalized path that should be equivalent to ALLOWED_DIR/file.txt
      const expectedPath = path.resolve(path.normalize(complexPath));
      const writeFileArgs = fsMock.writeFile.mock.calls[0].arguments;
      assert.equal(writeFileArgs[0], expectedPath, "Path should be normalized correctly");
    });
  });

  // Real file system integration tests
  describe("Integration Tests with Real File System", () => {
    // Test directory setup for real file system tests
    const testDir = path.resolve("./test-temp-dir");
    const subDir = path.join(testDir, "sub-dir");
    const outsideDir = path.resolve("./outside-dir");

    // Create test directories before tests
    beforeEach(async () => {
      await fs.mkdir(testDir, { recursive: true });
      await fs.mkdir(outsideDir, { recursive: true });
    });

    // Clean up test directories after tests
    after(async () => {
      await fs.rm(testDir, { recursive: true, force: true });
      await fs.rm(outsideDir, { recursive: true, force: true });
    });

    it("should successfully write file in allowed directory", async () => {
      const filePath = path.join(testDir, "test-file.txt");
      const content = "test content";
      
      await secureWriteFile(filePath, content, [testDir]);
      
      const fileContent = await fs.readFile(filePath, "utf8");
      assert.strictEqual(fileContent, content);
    });

    it("should successfully write file in subdirectory and create missing directories", async () => {
      const filePath = path.join(subDir, "nested", "test-file.txt");
      const content = "test content in nested dir";
      
      await secureWriteFile(filePath, content, [testDir]);
      
      const fileContent = await fs.readFile(filePath, "utf8");
      assert.strictEqual(fileContent, content);
    });

    it("should allow writing to exact allowed file path match", async () => {
      const filePath = path.join(testDir, "exact-match.txt");
      const content = "exact match content";
      
      await secureWriteFile(filePath, content, [filePath]);
      
      const fileContent = await fs.readFile(filePath, "utf8");
      assert.strictEqual(fileContent, content);
    });

    it("should reject file path outside allowed directories", async () => {
      const filePath = path.join(outsideDir, "outside-file.txt");
      const content = "should not be written";
      
      await assert.rejects(
        async () => {
          await secureWriteFile(filePath, content, [testDir]);
        },
        (err) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes("not within the allowed output locations"));
          return true;
        }
      );
      
      // Verify file was not written
      try {
        await fs.access(filePath);
        assert.fail("File should not exist");
      } catch (err) {
        // Expected error - file should not exist
      }
    });

    it("should reject path traversal attempts", async () => {
      const traversalPath = path.join(testDir, "..", "traversal-file.txt");
      const content = "traversal content";
      
      await assert.rejects(
        async () => {
          await secureWriteFile(traversalPath, content, [testDir]);
        },
        (err) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes("not within the allowed output locations"));
          return true;
        }
      );
    });

    it("should handle multiple allowed paths", async () => {
      const filePath = path.join(outsideDir, "allowed-outside-file.txt");
      const content = "multi-allowed content";
      
      await secureWriteFile(filePath, content, [testDir, outsideDir]);
      
      const fileContent = await fs.readFile(filePath, "utf8");
      assert.strictEqual(fileContent, content);
    });
  });
});