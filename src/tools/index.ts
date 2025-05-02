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
// Import git diff review tools
import { geminiGitLocalDiffReviewTool } from "./geminiGitLocalDiffReviewTool.js";
import { geminiGitLocalDiffStreamReviewTool } from "./geminiGitLocalDiffStreamReviewTool.js";
import { geminiGitHubRepoReviewTool } from "./geminiGitHubRepoReviewTool.js";
import { geminiGitHubPRReviewTool } from "./geminiGitHubPRReviewTool.js";

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
    // Define types for the different tool registration function signatures
    type ToolWithService = (server: McpServer, service: GeminiService) => void;
    type ToolWithoutService = (server: McpServer) => void;
    type ToolRegistrationFn = ToolWithService | ToolWithoutService;

    // Handle tools with different function signatures
    const registerTool = (
      toolFn: ToolRegistrationFn,
      server: McpServer,
      service?: GeminiService
    ) => {
      try {
        // Check if the tool requires both server and service arguments
        if (toolFn.length >= 2) {
          if (!service) {
            throw new Error(
              `Tool function requires a service but none was provided`
            );
          }
          // Cast to handle TypeScript's limitation with union types and function parameters
          (toolFn as ToolWithService)(server, service);
        } else {
          // Tool only requires server
          (toolFn as ToolWithoutService)(server);
        }
      } catch (error: unknown) {
        logger.error(
          `Failed to register tool: ${error instanceof Error ? error.message : String(error)}`
        );
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

    // Register git diff review tools
    // Use type assertion to handle GitHub review tools that are direct Tool implementations
    // These actually need to be registered directly with the server since they're Express handlers
    server.tool(
      "gemini_gitLocalDiffReview",
      "Review local git diff using Gemini models",
      {},
      geminiGitLocalDiffReviewTool as unknown as (args: any) => Promise<any>
    );

    server.tool(
      "gemini_gitLocalDiffStreamReview",
      "Stream review of local git diff using Gemini models",
      {},
      geminiGitLocalDiffStreamReviewTool as unknown as (
        args: any
      ) => Promise<any>
    );

    // Register GitHub review tools
    server.tool(
      "gemini_githubRepoReview",
      "Review GitHub repository using Gemini models",
      {},
      geminiGitHubRepoReviewTool as unknown as (args: any) => Promise<any>
    );

    server.tool(
      "gemini_githubPRReview",
      "Review GitHub pull request using Gemini models",
      {},
      geminiGitHubPRReviewTool as unknown as (args: any) => Promise<any>
    );
  } catch (error: unknown) {
    logger.error(
      "Error registering tools:",
      error instanceof Error ? error.message : String(error)
    );
  }

  logger.info("All tools registered.");
}
