import { describe, it, expect } from "vitest";
// Import directly from the MCP SDK to ensure we're using the same class reference
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
// Import local error classes
import {
  ValidationError,
  NotFoundError,
  ConfigurationError,
  ServiceError,
  GeminiApiError,
  mapToMcpError,
} from "../../../src/utils/errors.js";

describe("mapToMcpError", () => {
  const TOOL_NAME = "test_tool";

  it("should return McpError instances directly", () => {
    const originalError = new McpError(
      ErrorCode.InvalidParams,
      "Original MCP error"
    );
    const mappedError = mapToMcpError(originalError, TOOL_NAME);
    expect(mappedError).toBe(originalError);
  });

  it("should map ValidationError to InvalidParams", () => {
    const validationError = new ValidationError("Invalid input");
    const mappedError = mapToMcpError(validationError, TOOL_NAME);

    // Check error code and message content
    expect(mappedError.code).toBe(ErrorCode.InvalidParams);
    expect(mappedError.message).toContain("Validation error");
    expect(mappedError.message).toContain("Invalid input");
  });

  it("should map NotFoundError to InvalidRequest", () => {
    const notFoundError = new NotFoundError("Resource not found");
    const mappedError = mapToMcpError(notFoundError, TOOL_NAME);

    // Check error code and message content
    expect(mappedError.code).toBe(ErrorCode.InvalidRequest);
    expect(mappedError.message).toContain("Resource not found");
  });

  it("should map ConfigurationError to InternalError", () => {
    const configError = new ConfigurationError("Invalid configuration");
    const mappedError = mapToMcpError(configError, TOOL_NAME);

    expect(mappedError.code).toBe(ErrorCode.InternalError); // Changed from FailedPrecondition
    expect(mappedError.message).toContain("Configuration error");
    expect(mappedError.message).toContain("Invalid configuration");
  });

  it("should map quota-related GeminiApiError to InternalError", () => {
    const quotaError = new GeminiApiError("Quota exceeded for this resource");
    const mappedError = mapToMcpError(quotaError, TOOL_NAME);

    expect(mappedError.code).toBe(ErrorCode.InternalError); // Changed from ResourceExhausted
    expect(mappedError.message).toContain("Quota exceeded");
  });

  it("should map rate limit GeminiApiError to InternalError", () => {
    const rateLimitError = new GeminiApiError(
      "Rate limit hit for this operation"
    );
    const mappedError = mapToMcpError(rateLimitError, TOOL_NAME);

    expect(mappedError.code).toBe(ErrorCode.InternalError); // Changed from ResourceExhausted
    expect(mappedError.message).toContain("rate limit hit");
  });

  it("should map permission-related GeminiApiError to InvalidRequest", () => {
    const permissionError = new GeminiApiError(
      "Permission denied for this operation"
    );
    const mappedError = mapToMcpError(permissionError, TOOL_NAME);

    expect(mappedError.code).toBe(ErrorCode.InvalidRequest); // Changed from PermissionDenied
    expect(mappedError.message).toContain("Permission denied");
  });

  it("should map not-found GeminiApiError to InvalidRequest", () => {
    const notFoundError = new GeminiApiError("Resource does not exist");
    const mappedError = mapToMcpError(notFoundError, TOOL_NAME);

    expect(mappedError.code).toBe(ErrorCode.InvalidRequest);
    expect(mappedError.message).toContain("Resource not found");
  });

  it("should map invalid argument GeminiApiError to InvalidParams", () => {
    const invalidParamError = new GeminiApiError("Invalid argument provided");
    const mappedError = mapToMcpError(invalidParamError, TOOL_NAME);

    expect(mappedError.code).toBe(ErrorCode.InvalidParams);
    expect(mappedError.message).toContain("Invalid parameters");
  });

  it("should map safety-related GeminiApiError to InvalidRequest", () => {
    const safetyError = new GeminiApiError(
      "Content blocked by safety settings"
    );
    const mappedError = mapToMcpError(safetyError, TOOL_NAME);

    expect(mappedError.code).toBe(ErrorCode.InvalidRequest);
    expect(mappedError.message).toContain("Content blocked by safety settings");
  });

  it("should map File API not supported errors to InvalidRequest", () => {
    const apiError = new GeminiApiError(
      "File API is not supported on Vertex AI"
    );
    const mappedError = mapToMcpError(apiError, TOOL_NAME);

    expect(mappedError.code).toBe(ErrorCode.InvalidRequest); // Changed from FailedPrecondition
    expect(mappedError.message).toContain("Operation not supported");
  });

  it("should map other GeminiApiError to InternalError", () => {
    const otherApiError = new GeminiApiError("Unknown API error");
    const mappedError = mapToMcpError(otherApiError, TOOL_NAME);

    expect(mappedError.code).toBe(ErrorCode.InternalError);
    expect(mappedError.message).toContain("Gemini API Error");
  });

  it("should map ServiceError to InternalError", () => {
    const serviceError = new ServiceError("Service processing failed");
    const mappedError = mapToMcpError(serviceError, TOOL_NAME);

    expect(mappedError.code).toBe(ErrorCode.InternalError);
    expect(mappedError.message).toContain("Service error");
  });

  it("should map standard Error to InternalError", () => {
    const standardError = new Error("Standard error occurred");
    const mappedError = mapToMcpError(standardError, TOOL_NAME);

    expect(mappedError.code).toBe(ErrorCode.InternalError);
    expect(mappedError.message).toContain(TOOL_NAME);
    expect(mappedError.message).toContain("Standard error occurred");
  });

  it("should handle string errors", () => {
    const stringError = "String error message";
    const mappedError = mapToMcpError(stringError, TOOL_NAME);

    expect(mappedError.code).toBe(ErrorCode.InternalError);
    expect(mappedError.message).toContain(stringError);
  });

  it("should handle object errors", () => {
    const objectError = { errorCode: 500, message: "Object error" };
    const mappedError = mapToMcpError(objectError, TOOL_NAME);

    expect(mappedError.code).toBe(ErrorCode.InternalError);
    // Should contain stringified version of the object
    expect(mappedError.message).toContain("Object error");
  });

  it("should handle null/undefined errors", () => {
    const nullError = null;
    const mappedError = mapToMcpError(nullError, TOOL_NAME);

    expect(mappedError.code).toBe(ErrorCode.InternalError);
    expect(mappedError.message).toContain("An unknown error occurred");
  });

  // Testing if the error details are properly handled in mapping
  it("should handle errors with details", () => {
    // Create an error with details
    const errorWithDetails = new GeminiApiError("API error with details", {
      key: "value",
    });

    // Directly check the original error - it should have details
    expect(errorWithDetails).toHaveProperty("details");
    expect(errorWithDetails.details).toEqual({ key: "value" });

    // Map it to an McpError
    const mappedError = mapToMcpError(errorWithDetails, TOOL_NAME);

    // Basic assertions
    expect(mappedError).toBeInstanceOf(Object);
    expect(mappedError).not.toBeNull();
    expect(mappedError.code).toBe(ErrorCode.InternalError);

    // Verify mapping occurs correctly
    expect(mappedError).toBeInstanceOf(McpError);
    expect(mappedError.message).toContain("API error with details");

    // If McpError supports data property for error details, check it
    if ("data" in mappedError) {
      expect(mappedError.data).toBeDefined();
    }
  });
});
