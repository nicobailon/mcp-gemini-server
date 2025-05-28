// Simple helper to debug errors
import { GeminiApiError, mapToMcpError } from "../../src/utils/errors.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

// Create a test error with details
const errorWithDetails = new GeminiApiError("API error with details", {
  key: "value",
});
const mappedError = mapToMcpError(errorWithDetails, "DEBUG_TOOL");

// Log the result for inspection
console.log("Original Error:", {
  message: errorWithDetails.message,
  details: errorWithDetails.details,
  hasDetailsProperty: "details" in errorWithDetails,
});

// Type assertion to McpError to ensure TypeScript recognizes the optional details property
const typedMappedError = mappedError as McpError;

console.log("Mapped Error:", {
  code: typedMappedError.code,
  message: typedMappedError.message,
  data: typedMappedError.data,
  hasDataProperty: "data" in typedMappedError,
});
