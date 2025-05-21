import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";

// Import MCP client service
import { McpClientService } from "../../src/services/mcp/McpClientService.js";

// Import tool processors for direct invocation
import { mcpConnectToServerTool } from "../../src/tools/mcpConnectToServerTool.js";
import { mcpListServerToolsTool } from "../../src/tools/mcpListServerToolsTool.js";
import { mcpCallServerTool } from "../../src/tools/mcpCallServerTool.js";
import { mcpDisconnectFromServerTool } from "../../src/tools/mcpDisconnectFromServerTool.js";
import { writeToFileTool } from "../../src/tools/writeToFileTool.js";

// Import Configuration manager
import { ConfigurationManager } from "../../src/config/ConfigurationManager.js";

// To mock the MCP server for testing
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Test fixture for capturing tool processors
type ToolProcessor = (...args: unknown[]) => Promise<unknown>;
interface ToolProcessors {
  connect: ToolProcessor;
  listTools: ToolProcessor;
  callServerTool: ToolProcessor;
  disconnect: ToolProcessor;
  writeToFile: ToolProcessor;
}

// Helper functions to set up integration environment
function createTempOutputDir(): Promise<string> {
  // Create a temporary directory for test file outputs
  const tempDir = path.join(os.tmpdir(), `mcp-client-test-${Date.now()}`);
  return fs.mkdir(tempDir, { recursive: true }).then(() => tempDir);
}

async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    // Recursively delete the temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error(`Error cleaning up temp directory: ${error}`);
  }
}

// Helper to mock the ConfigurationManager
function mockConfigurationManager(tempDir: string): void {
  // Backup the original getInstance
  const originalGetInstance = ConfigurationManager.getInstance;

  // Mock getInstance
  ConfigurationManager.getInstance = function getInstance() {
    const instance = originalGetInstance.call(ConfigurationManager);

    // Mock the getAllowedOutputPaths method
    instance.getAllowedOutputPaths = () => [tempDir];

    // Mock the getMcpConfig method
    instance.getMcpConfig = () => ({
      host: "localhost",
      port: 3456,
      connectionToken: "test-token",
      clientId: "test-client",
      logLevel: "info",
      transport: "stdio",
    });

    return instance;
  };
}

// Helper to restore the original ConfigurationManager
function restoreConfigurationManager(): void {
  // Restore the original getInstance method
  delete (
    ConfigurationManager as unknown as {
      getInstance?: () => ConfigurationManager;
    }
  ).getInstance;
}

// Generic function to capture tool processor from tool registration
function captureToolProcessor(
  toolFn: (server: unknown, service?: unknown) => unknown,
  mcpClientService: McpClientService
): ToolProcessor {
  // Create a mock MCP server
  const mockMcpServer = {
    tool: (
      _name: string,
      _description: string,
      _schema: unknown,
      processor: ToolProcessor
    ) => {
      return processor;
    },
  } as unknown as McpServer;

  // Call the tool registration function to get the processor
  return toolFn(mockMcpServer, mcpClientService) as unknown as ToolProcessor;
}

// Start dummy MCP server (stdio)
async function startDummyMcpServerStdio(): Promise<ChildProcess> {
  const serverPath = path.resolve("./tests/integration/dummyMcpServerStdio.js");

  // Start the child process with node, ensuring proper stdio handling
  const nodeProcess = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_OPTIONS: "--no-warnings --experimental-specifier-resolution=node",
    },
  });

  // Create a Promise that resolves when the server is ready
  return new Promise((resolve, reject) => {
    let errorOutput = "";

    // Listen for data on stderr to detect when server is ready
    nodeProcess.stderr.on("data", (data) => {
      const message = data.toString();
      errorOutput += message;

      // When we see the server ready message, resolve
      if (message.includes("Dummy MCP Server (stdio) started")) {
        resolve(nodeProcess);
      }
    });

    // Handle startup failure
    nodeProcess.on("error", (err) => {
      reject(new Error(`Failed to start dummy server: ${err.message}`));
    });

    // Set a timeout in case the server doesn't start
    const timeout = setTimeout(() => {
      nodeProcess.kill();
      reject(
        new Error(
          `Timeout waiting for dummy server to start. Last output: ${errorOutput}`
        )
      );
    }, 5000);

    // Clear the timeout if we resolve or reject
    nodeProcess.on("exit", () => {
      clearTimeout(timeout);
    });
  });
}

// Start dummy MCP server (SSE)
async function startDummyMcpServerSse(port = 3456): Promise<ChildProcess> {
  const serverPath = path.resolve("./tests/integration/dummyMcpServerSse.js");

  // Start the child process with node
  const nodeProcess = spawn("node", [serverPath, port.toString()], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_OPTIONS: "--no-warnings --experimental-specifier-resolution=node",
    },
  });

  // Create a Promise that resolves when the server is ready
  return new Promise((resolve, reject) => {
    let errorOutput = "";

    // Listen for data on stderr to detect when server is ready
    nodeProcess.stderr.on("data", (data) => {
      const message = data.toString();
      errorOutput += message;

      // When we see the server ready message, resolve
      if (message.includes(`Dummy MCP Server (SSE) started on port ${port}`)) {
        resolve(nodeProcess);
      }
    });

    // Handle startup failure
    nodeProcess.on("error", (err) => {
      reject(new Error(`Failed to start dummy server: ${err.message}`));
    });

    // Set a timeout in case the server doesn't start
    const timeout = setTimeout(() => {
      nodeProcess.kill();
      reject(
        new Error(
          `Timeout waiting for dummy server to start. Last output: ${errorOutput}`
        )
      );
    }, 5000);

    // Clear the timeout if we resolve or reject
    nodeProcess.on("exit", () => {
      clearTimeout(timeout);
    });
  });
}

describe("MCP Client Integration Tests", () => {
  let mcpClientService: McpClientService;
  let processors: ToolProcessors;
  let tempDir: string;
  let stdioServer: ChildProcess | null = null;
  let sseServer: ChildProcess | null = null;

  // Set up test environment before all tests
  before(async () => {
    // Create a temporary directory for test outputs
    tempDir = await createTempOutputDir();

    // Mock ConfigurationManager to use our test settings
    mockConfigurationManager(tempDir);

    // Initialize the MCP client service
    mcpClientService = new McpClientService();

    // Capture tool processors for testing
    processors = {
      connect: captureToolProcessor(mcpConnectToServerTool, mcpClientService),
      listTools: captureToolProcessor(mcpListServerToolsTool, mcpClientService),
      callServerTool: captureToolProcessor(mcpCallServerTool, mcpClientService),
      disconnect: captureToolProcessor(
        mcpDisconnectFromServerTool,
        mcpClientService
      ),
      writeToFile: captureToolProcessor(writeToFileTool, mcpClientService),
    };
  });

  // Clean up after all tests
  after(async () => {
    // Close any open MCP connections
    mcpClientService.closeAllConnections();

    // Kill the server processes if they're still running
    if (stdioServer) {
      stdioServer.kill();
    }

    if (sseServer) {
      sseServer.kill();
    }

    // Restore the original ConfigurationManager
    restoreConfigurationManager();

    // Clean up temporary directory
    await cleanupTempDir(tempDir);
  });

  describe("STDIO Transport Tests", () => {
    // Set up stdio server before each test in this group
    beforeEach(async () => {
      // Start the dummy stdio server
      stdioServer = await startDummyMcpServerStdio();
    });

    // Clean up stdio server after each test
    afterEach(() => {
      // Kill the stdio server
      if (stdioServer) {
        stdioServer.kill();
        stdioServer = null;
      }

      // Close any connections
      mcpClientService.closeAllConnections();
    });

    it("should connect to a stdio server, list tools, call a tool, and disconnect", async () => {
      // Step 1: Call the connect processor to connect to the dummy stdio server
      const connectArgs = {
        transport: "stdio",
        connectionDetails: {
          transport: "stdio",
          command: "node",
          args: ["./tests/integration/dummyMcpServerStdio.js"],
        },
      };

      // Connect to the server
      const connectResult = await processors.connect(connectArgs);

      // Extract the connection ID from the result
      const resultJson = JSON.parse(connectResult.content[0].text);
      const connectionId = resultJson.connectionId;

      // Verify connection ID was returned and is a string
      assert.ok(connectionId, "Connection ID should be returned");
      assert.strictEqual(
        typeof connectionId,
        "string",
        "Connection ID should be a string"
      );

      // Step 2: List tools on the connected server
      const listToolsArgs = {
        connectionId,
      };

      const listToolsResult = await processors.listTools(listToolsArgs);

      // Parse the tools list
      const toolsList = JSON.parse(listToolsResult.content[0].text);

      // Verify tools list
      assert.ok(Array.isArray(toolsList), "Tools list should be an array");
      assert.ok(toolsList.length >= 3, "At least 3 tools should be available");

      // Verify expected tools are in the list
      const toolNames = toolsList.map((tool: { name: string }) => tool.name);
      assert.ok(
        toolNames.includes("echoTool"),
        "Echo tool should be available"
      );
      assert.ok(toolNames.includes("addTool"), "Add tool should be available");
      assert.ok(
        toolNames.includes("complexDataTool"),
        "Complex data tool should be available"
      );

      // Step 3: Call the echo tool
      const echoMessage = "Hello from integration test";
      const callToolArgs = {
        connectionId,
        toolName: "echoTool",
        toolParameters: {
          message: echoMessage,
        },
      };

      const callToolResult = await processors.callServerTool(callToolArgs);

      // Parse the result
      const echoResult = JSON.parse(callToolResult.content[0].text);

      // Verify echo result
      assert.strictEqual(
        echoResult.message,
        echoMessage,
        "Echo tool should return the sent message"
      );
      assert.ok(echoResult.timestamp, "Echo tool should include a timestamp");

      // Step 4: Call the add tool
      const addArgs = {
        connectionId,
        toolName: "addTool",
        toolParameters: {
          a: 5,
          b: 7,
        },
      };

      const addResult = await processors.callServerTool(addArgs);

      // Parse the result
      const addOutput = JSON.parse(addResult.content[0].text);

      // Verify add result
      assert.strictEqual(
        addOutput.sum,
        12,
        "Add tool should correctly sum the numbers"
      );
      assert.deepStrictEqual(
        addOutput.inputs,
        { a: 5, b: 7 },
        "Add tool should return the input values"
      );

      // Step 5: Disconnect from the server
      const disconnectArgs = {
        connectionId,
      };

      const disconnectResult = await processors.disconnect(disconnectArgs);

      // Parse the disconnect result
      const disconnectOutput = JSON.parse(disconnectResult.content[0].text);

      // Verify disconnect result
      assert.strictEqual(
        disconnectOutput.connectionId,
        connectionId,
        "Disconnect should return the connection ID"
      );
      assert.ok(
        disconnectOutput.message.includes("Connection closed"),
        "Disconnect should confirm connection closure"
      );

      // Verify the connection is no longer in the active connections list
      assert.strictEqual(
        mcpClientService.getActiveStdioConnectionIds().length,
        0,
        "No active stdio connections should remain"
      );
    });

    it("should call a tool and write output to a file", async () => {
      // Step 1: Connect to the dummy stdio server
      const connectArgs = {
        transport: "stdio",
        connectionDetails: {
          transport: "stdio",
          command: "node",
          args: ["./tests/integration/dummyMcpServerStdio.js"],
        },
      };

      const connectResult = await processors.connect(connectArgs);
      const resultJson = JSON.parse(connectResult.content[0].text);
      const connectionId = resultJson.connectionId;

      // Step 2: Call the complexDataTool and write output to a file
      const outputPath = path.join(tempDir, "complex-data-output.json");
      const callToolArgs = {
        connectionId,
        toolName: "complexDataTool",
        toolParameters: {
          depth: 2,
          itemCount: 3,
        },
        outputFilePath: outputPath,
      };

      const callToolResult = await processors.callServerTool(callToolArgs);

      // Parse the result
      const callToolOutput = JSON.parse(callToolResult.content[0].text);

      // Verify the result contains the expected information
      assert.strictEqual(
        callToolOutput.message,
        "Output written to file",
        "Should confirm file was written"
      );
      assert.strictEqual(
        callToolOutput.filePath,
        outputPath,
        "Should return the correct file path"
      );

      // Verify the file exists and contains the expected data
      const fileExists = await fs
        .access(outputPath)
        .then(() => true)
        .catch(() => false);
      assert.ok(fileExists, "Output file should exist");

      // Read the file contents
      const fileContent = await fs.readFile(outputPath, "utf8");
      const fileData = JSON.parse(fileContent);

      // Verify file content structure
      assert.strictEqual(fileData.level, 1, "Root level should be 1");
      assert.strictEqual(
        fileData.items.length,
        3,
        "Should have 3 items as specified"
      );
      assert.strictEqual(
        fileData.items[0].level,
        2,
        "Nested level should be 2"
      );

      // Clean up - disconnect from the server
      await processors.disconnect({ connectionId });
    });
  });

  describe("SSE Transport Tests", () => {
    // Set up SSE server before each test in this group
    beforeEach(async () => {
      // Start the dummy SSE server
      sseServer = await startDummyMcpServerSse();
    });

    // Clean up SSE server after each test
    afterEach(() => {
      // Kill the SSE server
      if (sseServer) {
        sseServer.kill();
        sseServer = null;
      }

      // Close any connections
      mcpClientService.closeAllConnections();
    });

    it("should connect to an SSE server, list tools, call a tool, and disconnect", async () => {
      // Step 1: Call the connect processor to connect to the dummy SSE server
      const ssePort = 3456;
      const connectArgs = {
        transport: "sse",
        connectionDetails: {
          transport: "sse",
          url: `http://localhost:${ssePort}/mcp`,
        },
      };

      // Connect to the server
      const connectResult = await processors.connect(connectArgs);

      // Extract the connection ID from the result
      const resultJson = JSON.parse(connectResult.content[0].text);
      const connectionId = resultJson.connectionId;

      // Verify connection ID was returned and is a string
      assert.ok(connectionId, "Connection ID should be returned");
      assert.strictEqual(
        typeof connectionId,
        "string",
        "Connection ID should be a string"
      );

      // Step 2: List tools on the connected server
      const listToolsArgs = {
        connectionId,
      };

      const listToolsResult = await processors.listTools(listToolsArgs);

      // Parse the tools list
      const toolsList = JSON.parse(listToolsResult.content[0].text);

      // Verify tools list
      assert.ok(Array.isArray(toolsList), "Tools list should be an array");
      assert.ok(toolsList.length >= 3, "At least 3 tools should be available");

      // Verify expected tools are in the list
      const toolNames = toolsList.map((tool: { name: string }) => tool.name);
      assert.ok(
        toolNames.includes("echoTool"),
        "Echo tool should be available"
      );
      assert.ok(toolNames.includes("addTool"), "Add tool should be available");
      assert.ok(
        toolNames.includes("complexDataTool"),
        "Complex data tool should be available"
      );

      // Step 3: Call the echo tool
      const echoMessage = "Hello from SSE integration test";
      const callToolArgs = {
        connectionId,
        toolName: "echoTool",
        toolParameters: {
          message: echoMessage,
        },
      };

      const callToolResult = await processors.callServerTool(callToolArgs);

      // Parse the result
      const echoResult = JSON.parse(callToolResult.content[0].text);

      // Verify echo result
      assert.strictEqual(
        echoResult.message,
        echoMessage,
        "Echo tool should return the sent message"
      );
      assert.ok(echoResult.timestamp, "Echo tool should include a timestamp");

      // Step 4: Disconnect from the server
      const disconnectArgs = {
        connectionId,
      };

      const disconnectResult = await processors.disconnect(disconnectArgs);

      // Parse the disconnect result
      const disconnectOutput = JSON.parse(disconnectResult.content[0].text);

      // Verify disconnect result
      assert.strictEqual(
        disconnectOutput.connectionId,
        connectionId,
        "Disconnect should return the connection ID"
      );
      assert.ok(
        disconnectOutput.message.includes("Connection closed"),
        "Disconnect should confirm connection closure"
      );

      // Verify the connection is no longer in the active connections list
      assert.strictEqual(
        mcpClientService.getActiveSseConnectionIds().length,
        0,
        "No active SSE connections should remain"
      );
    });
  });

  describe("Write to File Tool Tests", () => {
    // Create mock MCP server for writeToFile tests
    let mockMcpServer: unknown;
    let writeToFileProcessor: ToolProcessor;

    beforeEach(() => {
      // Create a fresh mock MCP server for each test
      mockMcpServer = {
        tool: (
          _name: string,
          _desc: string,
          _schema: unknown,
          processor: ToolProcessor
        ) => processor,
      } as unknown as McpServer;

      // Register the writeToFileTool and capture its processor
      writeToFileProcessor = writeToFileTool(
        mockMcpServer
      ) as unknown as ToolProcessor;
    });

    it("should write a string to a file", async () => {
      // Create the file path for the test
      const testFilePath = path.join(tempDir, "test-utf8-output.txt");
      const testContent =
        "This is a test string to write to a file\nWith multiple lines\nAnd special chars: €£¥©®™";

      // Call the writeToFile processor
      const args = {
        filePath: testFilePath,
        content: testContent,
        encoding: "utf8",
      };

      const result = await writeToFileProcessor(args);

      // Parse the result
      const resultJson = JSON.parse(result.content[0].text);

      // Verify the result contains the expected information
      assert.strictEqual(
        resultJson.message,
        "Content written to file successfully.",
        "Should confirm file was written"
      );
      assert.strictEqual(
        resultJson.filePath,
        testFilePath,
        "Should return the correct file path"
      );

      // Verify the file exists and contains the correct data
      const fileExists = await fs
        .access(testFilePath)
        .then(() => true)
        .catch(() => false);
      assert.ok(fileExists, "Output file should exist");

      // Read the file and compare the content
      const fileContent = await fs.readFile(testFilePath, "utf8");
      assert.strictEqual(
        fileContent,
        testContent,
        "File content should match the original string"
      );
    });

    it("should write a base64 encoded string to a file", async () => {
      // Create the file path for the test
      const testFilePath = path.join(tempDir, "test-base64-output.txt");

      // Create a test string and encode it to base64
      const originalString =
        "This is a test string that will be base64 encoded\nWith multiple lines\nAnd special chars: €£¥©®™";
      const base64Content = Buffer.from(originalString).toString("base64");

      // Call the writeToFile processor
      const args = {
        filePath: testFilePath,
        content: base64Content,
        encoding: "base64",
      };

      const result = await writeToFileProcessor(args);

      // Parse the result
      const resultJson = JSON.parse(result.content[0].text);

      // Verify the result contains the expected information
      assert.strictEqual(
        resultJson.message,
        "Content written to file successfully.",
        "Should confirm file was written"
      );
      assert.strictEqual(
        resultJson.filePath,
        testFilePath,
        "Should return the correct file path"
      );

      // Verify the file exists and contains the correct data
      const fileExists = await fs
        .access(testFilePath)
        .then(() => true)
        .catch(() => false);
      assert.ok(fileExists, "Output file should exist");

      // Read the file and compare the content
      const fileContent = await fs.readFile(testFilePath, "utf8");
      assert.strictEqual(
        fileContent,
        originalString,
        "File content should match the original string after base64 decoding"
      );
    });

    it("should fail when writing to a path outside allowed directories", async () => {
      // Try to write to an absolute path outside the allowed directory
      const nonAllowedPath = path.join(
        os.tmpdir(),
        "..",
        "non-allowed-dir",
        "test.txt"
      );

      const args = {
        filePath: nonAllowedPath,
        content: "This should not be written",
        encoding: "utf8",
      };

      // The call should reject because the path is not allowed
      await assert.rejects(
        async () => await writeToFileProcessor(args),
        (error: unknown) => {
          // Use type assertion to access the error message property
          const errorWithMessage = error as { message: string };
          assert.ok(
            errorWithMessage.message.includes("Security error") ||
              errorWithMessage.message.includes(
                "not within the allowed output"
              ) ||
              errorWithMessage.message.includes("InvalidParams"),
            "Should fail with security error"
          );
          return true;
        }
      );

      // Verify the file does not exist
      const fileExists = await fs
        .access(nonAllowedPath)
        .then(() => true)
        .catch(() => false);
      assert.strictEqual(
        fileExists,
        false,
        "File should not have been created"
      );
    });
  });
});
