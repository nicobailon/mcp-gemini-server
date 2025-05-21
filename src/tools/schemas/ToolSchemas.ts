/**
 * Tool Schemas - Gemini API Specific Tool Types
 *
 * This file contains the schema definitions for tools compatible with the Gemini API.
 */
import { z } from "zod";
import {
  FunctionParameterTypeSchema,
  FunctionParameterSchema,
  FunctionParameterPropertiesSchema,
  FunctionDeclarationSchema,
  ToolConfigSchema,
} from "./CommonSchemas.js";

/**
 * Complete schema for a tool with function declarations
 */
export const ToolSchema = z
  .object({
    functionDeclarations: z
      .array(FunctionDeclarationSchema)
      .optional()
      .describe("List of function declarations for this tool."),
    // Can add other tool types like Retrieval, GoogleSearchRetrieval if needed
  })
  .describe("Represents a tool definition containing function declarations.");

/**
 * Schema for a tool response
 */
export const ToolResponseSchema = z
  .object({
    name: z.string().describe("The name of the tool that was called"),
    response: z.any().describe("The response returned by the tool"),
  })
  .describe("Response from a tool execution");

// Export for direct use in tool implementations
export {
  FunctionParameterTypeSchema,
  FunctionParameterSchema,
  FunctionParameterPropertiesSchema,
  FunctionDeclarationSchema,
  ToolConfigSchema,
};
