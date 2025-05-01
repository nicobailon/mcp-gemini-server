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
import { geminiRouteMessageTool } from "./geminiRouteMessageTool.js";
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
// Import audio transcription tool
import { geminiAudioTranscriptionTool } from "./geminiAudioTranscriptionTool.js";

/**
 * Register all defined tools with the MCP server instance.
 * This function centralizes tool registration logic.
 */
export function registerTools(server: McpServer): void {
  logger.info("Registering tools...");
  const configManager = ConfigurationManager.getInstance();

  // Create a single GeminiService instance
  // GeminiService gets its config directly from ConfigurationManager
  const geminiServiceInstance = new GeminiService();

  // Use a consistent approach to call all tools
  try {
    // Handle tools with different function signatures using type assertions and function introspection
    const registerTool = (toolFn: any, ...args: any[]) => {
      try {
        // Handle functions that take a different number of arguments
        // by checking the function signature length and adapting accordingly
        if (toolFn.length === 0) {
          // Function doesn't expect any arguments
          toolFn();
        } else if (toolFn.length === 1) {
          // Function expects just the server argument
          toolFn(server);
        } else {
          // Function expects server and possibly service instance
          toolFn(...args);
        }
      } catch (error) {
        logger.error(`Failed to register tool: ${error}`);
      }
    };

    // Register example tool with a special case for its interface
    // Use type assertion to handle the interface mismatch
    (exampleTool as (server: McpServer) => void)(server);

    // Register content generation tools
    registerTool(geminiGenerateContentTool, server, geminiServiceInstance);
    registerTool(
      geminiGenerateContentStreamTool,
      server,
      geminiServiceInstance
    );
    registerTool(geminiFunctionCallTool, server, geminiServiceInstance);

    // Register chat tools
    registerTool(geminiStartChatTool, server, geminiServiceInstance);
    registerTool(geminiSendMessageTool, server, geminiServiceInstance);
    registerTool(geminiSendFunctionResultTool, server, geminiServiceInstance);
    registerTool(geminiRouteMessageTool, server, geminiServiceInstance);

    // Register File Handling tools
    registerTool(geminiUploadFileTool, server, geminiServiceInstance);
    registerTool(geminiListFilesTool, server, geminiServiceInstance);
    registerTool(geminiGetFileTool, server, geminiServiceInstance);
    registerTool(geminiDeleteFileTool, server, geminiServiceInstance);

    // Register Caching tools
    registerTool(geminiCreateCacheTool, server, geminiServiceInstance);
    registerTool(geminiListCachesTool, server, geminiServiceInstance);
    registerTool(geminiGetCacheTool, server, geminiServiceInstance);
    registerTool(geminiUpdateCacheTool, server, geminiServiceInstance);
    registerTool(geminiDeleteCacheTool, server, geminiServiceInstance);

    // Register image feature tools
    registerTool(geminiGenerateImageTool, server);
    registerTool(geminiObjectDetectionTool, server);
    registerTool(geminiContentUnderstandingTool, server);

    // Register audio transcription tool
    registerTool(geminiAudioTranscriptionTool, server);
  } catch (error) {
    logger.error("Error registering tools:", error);
  }

  logger.info("All tools registered.");
}
