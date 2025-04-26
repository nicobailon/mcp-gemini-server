import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ConfigurationManager } from "../config/ConfigurationManager.js";
import { logger } from "../utils/index.js";
import { GeminiService } from "../services/index.js"; // Import GeminiService

// Import tool registration functions
import { exampleTool } from "./exampleTool.js";
import { geminiGenerateContentTool } from "./geminiGenerateContentTool.js";
import { geminiGenerateContentStreamTool } from "./geminiGenerateContentStreamTool.js";
import { geminiFunctionCallTool } from "./geminiFunctionCallTool.js";
import { geminiStartChatTool } from "./geminiStartChatTool.js";
import { geminiSendMessageTool } from "./geminiSendMessageTool.js";
import { geminiSendFunctionResultTool } from "./geminiSendFunctionResultTool.js";
// --- File Handling Tool Imports ---
import { geminiUploadFileTool } from "./geminiUploadFileTool.js";
import { geminiListFilesTool } from "./geminiListFilesTool.js";
import { geminiGetFileTool } from "./geminiGetFileTool.js";
import { geminiDeleteFileTool } from "./geminiDeleteFileTool.js";
// --- Caching Tool Imports ---
import { geminiCreateCacheTool } from "./geminiCreateCacheTool.js";
import { geminiListCachesTool } from "./geminiListCachesTool.js";
import { geminiGetCacheTool } from "./geminiGetCacheTool.js";
import { geminiUpdateCacheTool } from "./geminiUpdateCacheTool.js";
import { geminiDeleteCacheTool } from "./geminiDeleteCacheTool.js";
// Import image feature tools
import { geminiGenerateImageTool } from "./geminiGenerateImageTool.js";
import { geminiObjectDetectionTool } from "./geminiObjectDetectionTool.js";
import { geminiContentUnderstandingTool } from "./geminiContentUnderstandingTool.js";

/**
 * Register all defined tools with the MCP server instance.
 * This function centralizes tool registration logic.
 */
export function registerTools(server: McpServer): void {
  logger.info("Registering tools...");
  const configManager = ConfigurationManager.getInstance();

  // Register each tool, passing necessary config or services
  exampleTool(server, configManager.getExampleServiceConfig());
  // Assuming getGeminiServiceConfig exists in ConfigurationManager
  const geminiConfig = configManager.getGeminiServiceConfig();
  // Create a single GeminiService instance
  const geminiServiceInstance = new GeminiService(geminiConfig);

  // Pass the service instance to the tools that need it
  geminiGenerateContentTool(server, geminiServiceInstance); // Assuming this tool needs the service instance now
  geminiGenerateContentStreamTool(server, geminiServiceInstance); // Pass instance
  geminiFunctionCallTool(server, geminiServiceInstance); // Pass instance

  // Register new chat tools, passing the same service instance
  geminiStartChatTool(server, geminiServiceInstance);
  geminiSendMessageTool(server, geminiServiceInstance);
  geminiSendFunctionResultTool(server, geminiServiceInstance);

  // Register File Handling tools
  geminiUploadFileTool(server, geminiServiceInstance);
  geminiListFilesTool(server, geminiServiceInstance);
  geminiGetFileTool(server, geminiServiceInstance);
  geminiDeleteFileTool(server, geminiServiceInstance);

  // Register Caching tools
  geminiCreateCacheTool(server, geminiServiceInstance);
  geminiListCachesTool(server, geminiServiceInstance);
  geminiGetCacheTool(server, geminiServiceInstance);
  geminiUpdateCacheTool(server, geminiServiceInstance);
  geminiDeleteCacheTool(server, geminiServiceInstance);

  // Register image feature tools
  geminiGenerateImageTool(server, geminiServiceInstance);
  geminiObjectDetectionTool(server, geminiServiceInstance);
  geminiContentUnderstandingTool(server, geminiServiceInstance);

  logger.info("All tools registered.");
}
