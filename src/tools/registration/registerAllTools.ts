/**
 * Tool Registration - Central registration point for all tools
 *
 * This file uses the new ToolRegistry system to register all tools.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolRegistry } from "./ToolRegistry.js";
import {
  adaptServerOnlyTool,
  adaptGeminiServiceTool,
  adaptMcpClientServiceTool,
  adaptDirectTool,
} from "./ToolAdapter.js";
import { logger } from "../../utils/logger.js";
import { GeminiService } from "../../services/GeminiService.js";
import { McpClientService } from "../../services/mcp/McpClientService.js";

// Import tool registration functions
import { exampleTool } from "../exampleTool.js";
import { geminiGenerateContentTool } from "../geminiGenerateContentTool.js";
import { geminiGenerateContentStreamTool } from "../geminiGenerateContentStreamTool.js";
import { geminiFunctionCallTool } from "../geminiFunctionCallTool.js";
import { geminiStartChatTool } from "../geminiStartChatTool.js";
import { geminiSendMessageTool } from "../geminiSendMessageTool.js";
import { geminiSendFunctionResultTool } from "../geminiSendFunctionResultTool.js";
import { geminiRouteMessageTool } from "../geminiRouteMessageTool.js";
// --- File Handling Tool Imports ---
import { geminiUploadFileTool } from "../geminiUploadFileTool.js";
import { geminiListFilesTool } from "../geminiListFilesTool.js";
import { geminiGetFileTool } from "../geminiGetFileTool.js";
import { geminiDeleteFileTool } from "../geminiDeleteFileTool.js";
// --- Caching Tool Imports ---
import { geminiCreateCacheTool } from "../geminiCreateCacheTool.js";
import { geminiListCachesTool } from "../geminiListCachesTool.js";
import { geminiGetCacheTool } from "../geminiGetCacheTool.js";
import { geminiUpdateCacheTool } from "../geminiUpdateCacheTool.js";
import { geminiDeleteCacheTool } from "../geminiDeleteCacheTool.js";
// Image feature tools
import { geminiGenerateImageTool } from "../geminiGenerateImageTool.js";
import { geminiObjectDetectionTool } from "../geminiObjectDetectionTool.js";
import { geminiContentUnderstandingTool } from "../geminiContentUnderstandingTool.js";
// Audio transcription tool
import { geminiAudioTranscriptionTool } from "../geminiAudioTranscriptionTool.js";
// Git diff review tools
import { geminiGitLocalDiffReviewTool } from "../geminiGitLocalDiffReviewTool.js";
import { geminiGitLocalDiffStreamReviewTool } from "../geminiGitLocalDiffStreamReviewTool.js";
import { geminiGitHubRepoReviewTool } from "../geminiGitHubRepoReviewTool.js";
import { geminiGitHubPRReviewTool } from "../geminiGitHubPRReviewTool.js";
// URL Context tools
import { geminiUrlAnalysisTool } from "../geminiUrlAnalysisTool.js";
// MCP tools
import { mcpConnectToServerTool } from "../mcpConnectToServerTool.js";
import { mcpDisconnectFromServerTool } from "../mcpDisconnectFromServerTool.js";
import { mcpListServerToolsTool } from "../mcpListServerToolsTool.js";
import { mcpCallServerTool } from "../mcpCallServerTool.js";
// File utils tool
import { writeToFileTool } from "../writeToFileTool.js";

/**
 * Register all tools with the MCP server using the new registry system
 * @param server MCP server instance
 * @returns McpClientService instance for managing connections
 */
export function registerAllTools(server: McpServer): McpClientService {
  logger.info("Initializing services and tool registry...");

  // Create service instances
  const geminiService = new GeminiService();
  const mcpClientService = new McpClientService();

  // Create the tool registry
  const registry = new ToolRegistry(geminiService, mcpClientService);

  try {
    // Register all tools with appropriate adapters

    // Example tool
    registry.registerTool(adaptServerOnlyTool(exampleTool, "exampleTool"));

    // Content generation tools
    registry.registerTool(
      adaptGeminiServiceTool(
        geminiGenerateContentTool,
        "geminiGenerateContentTool"
      )
    );
    registry.registerTool(
      adaptGeminiServiceTool(
        geminiGenerateContentStreamTool,
        "geminiGenerateContentStreamTool"
      )
    );
    registry.registerTool(
      adaptGeminiServiceTool(geminiFunctionCallTool, "geminiFunctionCallTool")
    );

    // Chat tools
    registry.registerTool(
      adaptGeminiServiceTool(geminiStartChatTool, "geminiStartChatTool")
    );
    registry.registerTool(
      adaptGeminiServiceTool(geminiSendMessageTool, "geminiSendMessageTool")
    );
    registry.registerTool(
      adaptGeminiServiceTool(
        geminiSendFunctionResultTool,
        "geminiSendFunctionResultTool"
      )
    );
    registry.registerTool(
      adaptGeminiServiceTool(geminiRouteMessageTool, "geminiRouteMessageTool")
    );

    // File handling tools
    registry.registerTool(
      adaptGeminiServiceTool(geminiUploadFileTool, "geminiUploadFileTool")
    );
    registry.registerTool(
      adaptGeminiServiceTool(geminiListFilesTool, "geminiListFilesTool")
    );
    registry.registerTool(
      adaptGeminiServiceTool(geminiGetFileTool, "geminiGetFileTool")
    );
    registry.registerTool(
      adaptGeminiServiceTool(geminiDeleteFileTool, "geminiDeleteFileTool")
    );

    // Caching tools
    registry.registerTool(
      adaptGeminiServiceTool(geminiCreateCacheTool, "geminiCreateCacheTool")
    );
    registry.registerTool(
      adaptGeminiServiceTool(geminiListCachesTool, "geminiListCachesTool")
    );
    registry.registerTool(
      adaptGeminiServiceTool(geminiGetCacheTool, "geminiGetCacheTool")
    );
    registry.registerTool(
      adaptGeminiServiceTool(geminiUpdateCacheTool, "geminiUpdateCacheTool")
    );
    registry.registerTool(
      adaptGeminiServiceTool(geminiDeleteCacheTool, "geminiDeleteCacheTool")
    );

    // Image feature tools
    registry.registerTool(
      adaptServerOnlyTool(geminiGenerateImageTool, "geminiGenerateImageTool")
    );
    registry.registerTool(
      adaptServerOnlyTool(
        geminiObjectDetectionTool,
        "geminiObjectDetectionTool"
      )
    );
    registry.registerTool(
      adaptServerOnlyTool(
        geminiContentUnderstandingTool,
        "geminiContentUnderstandingTool"
      )
    );

    // Audio transcription tool
    registry.registerTool(
      adaptServerOnlyTool(
        geminiAudioTranscriptionTool,
        "geminiAudioTranscriptionTool"
      )
    );

    // URL Context tools
    registry.registerTool(
      adaptGeminiServiceTool(geminiUrlAnalysisTool, "geminiUrlAnalysisTool")
    );

    // Git diff review tools - these use a different registration pattern
    registry.registerTool(
      adaptDirectTool(
        "gemini_gitLocalDiffReview",
        "Review local git diff using Gemini models",
        geminiGitLocalDiffReviewTool as unknown as (
          args: unknown
        ) => Promise<unknown>
      )
    );

    registry.registerTool(
      adaptDirectTool(
        "gemini_gitLocalDiffStreamReview",
        "Stream review of local git diff using Gemini models",
        geminiGitLocalDiffStreamReviewTool as unknown as (
          args: unknown
        ) => Promise<unknown>
      )
    );

    registry.registerTool(
      adaptDirectTool(
        "gemini_githubRepoReview",
        "Review GitHub repository using Gemini models",
        geminiGitHubRepoReviewTool as unknown as (
          args: unknown
        ) => Promise<unknown>
      )
    );

    registry.registerTool(
      adaptDirectTool(
        "gemini_githubPRReview",
        "Review GitHub pull request using Gemini models",
        geminiGitHubPRReviewTool as unknown as (
          args: unknown
        ) => Promise<unknown>
      )
    );

    // MCP tools
    registry.registerTool(
      adaptMcpClientServiceTool(
        mcpConnectToServerTool,
        "mcpConnectToServerTool"
      )
    );
    registry.registerTool(
      adaptMcpClientServiceTool(
        mcpDisconnectFromServerTool,
        "mcpDisconnectFromServerTool"
      )
    );
    registry.registerTool(
      adaptMcpClientServiceTool(
        mcpListServerToolsTool,
        "mcpListServerToolsTool"
      )
    );
    registry.registerTool(
      adaptMcpClientServiceTool(mcpCallServerTool, "mcpCallServerTool")
    );

    // File utility tools
    registry.registerTool(
      adaptServerOnlyTool(writeToFileTool, "writeToFileTool")
    );

    // Register all tools with the server
    registry.registerAllTools(server);
  } catch (error) {
    logger.error(
      "Error registering tools:",
      error instanceof Error ? error.message : String(error)
    );
  }

  // Return the McpClientService instance for use in graceful shutdown
  return mcpClientService;
}
