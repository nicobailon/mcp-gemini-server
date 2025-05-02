/**
 * Base custom error class for application-specific errors.
 */
export class BaseError extends Error {
  public code: string;
  public readonly status: number; // HTTP status code equivalent
  public readonly details?: unknown; // Additional details

  constructor(
    message: string,
    code: string,
    status: number,
    details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name; // Set the error name to the class name
    this.code = code;
    this.status = status;
    this.details = details;
    // Capture stack trace (excluding constructor)
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error for validation failures (e.g., invalid input).
 * Maps typically to a 400 Bad Request or MCP InvalidParams.
 */
export class ValidationError extends BaseError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", 400, details);
  }
}

/**
 * Error when an expected entity or resource is not found.
 * Maps typically to a 404 Not Found.
 */
export class NotFoundError extends BaseError {
  constructor(message: string = "Resource not found") {
    super(message, "NOT_FOUND", 404);
  }
}

/**
 * Error for configuration problems.
 */
export class ConfigurationError extends BaseError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR", 500);
  }
}

/**
 * Error for issues during service processing unrelated to input validation.
 * Maps typically to a 500 Internal Server Error or MCP InternalError.
 */
export class ServiceError extends BaseError {
  constructor(message: string, details?: unknown) {
    super(message, "SERVICE_ERROR", 500, details);
  }
}

/**
 * Error specifically for issues encountered when interacting with the Google Gemini API.
 * Extends ServiceError as it relates to an external service failure.
 */
export class GeminiApiError extends ServiceError {
  constructor(message: string, details?: unknown) {
    // Call ServiceError constructor with only message and details
    super(`Gemini API Error: ${message}`, details);
    // Optionally add a specific code property if needed for finer-grained handling
    // this.code = 'GEMINI_API_ERROR'; // Overrides the 'SERVICE_ERROR' code from BaseError via ServiceError
  }
}

/**
 * Error specifically for when a file or resource is not found in the Gemini API.
 * Extends GeminiApiError to maintain the error hierarchy.
 */
export class GeminiResourceNotFoundError extends GeminiApiError {
  constructor(resourceType: string, resourceId: string, details?: unknown) {
    super(`${resourceType} not found: ${resourceId}`, details);
    this.code = "GEMINI_RESOURCE_NOT_FOUND";
  }
}

/**
 * Error for invalid parameters when calling the Gemini API.
 * Extends GeminiApiError to maintain the error hierarchy.
 */
export class GeminiInvalidParameterError extends GeminiApiError {
  constructor(message: string, details?: unknown) {
    super(`Invalid parameter: ${message}`, details);
    this.code = "GEMINI_INVALID_PARAMETER";
  }
}

/**
 * Error for authentication failures with the Gemini API.
 * Extends GeminiApiError to maintain the error hierarchy.
 */
export class GeminiAuthenticationError extends GeminiApiError {
  constructor(message: string, details?: unknown) {
    super(`Authentication error: ${message}`, details);
    this.code = "GEMINI_AUTHENTICATION_ERROR";
  }
}

/**
 * Error for when Gemini API quota is exceeded or rate limits are hit.
 * Extends GeminiApiError to maintain the error hierarchy.
 */
export class GeminiQuotaExceededError extends GeminiApiError {
  constructor(message: string, details?: unknown) {
    super(`Quota exceeded: ${message}`, details);
    this.code = "GEMINI_QUOTA_EXCEEDED";
  }
}

/**
 * Error for when content is blocked by Gemini's safety settings.
 * Extends GeminiApiError to maintain the error hierarchy.
 */
export class GeminiSafetyError extends GeminiApiError {
  constructor(message: string, details?: unknown) {
    super(`Content blocked by safety settings: ${message}`, details);
    this.code = "GEMINI_SAFETY_ERROR";
  }
}

// Import the McpError and ErrorCode from the MCP SDK for use in the mapping function
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { ToolError } from "./ToolError.js";

// Re-export ToolError for use by tools
export { ToolError };

/**
 * Maps internal application errors to standardized MCP errors.
 * This function ensures consistent error mapping across all tool handlers.
 *
 * @param error - The error to be mapped to an MCP error
 * @param toolName - The name of the tool where the error occurred (for better error messages)
 * @returns McpError - A properly mapped MCP error
 */
export function mapToMcpError(error: unknown, toolName: string): McpError {
  // If error is already an McpError, return it directly
  if (error instanceof McpError) {
    return error;
  }

  // Default error message if error is not an Error instance
  let errorMessage = "An unknown error occurred";
  let errorDetails: unknown = undefined;

  // Extract error message and details if error is an Error instance
  if (error instanceof Error) {
    errorMessage = error.message;

    // Extract details from BaseError instances
    if (error instanceof BaseError && error.details) {
      errorDetails = error.details;
    }
  } else if (typeof error === "string") {
    errorMessage = error;
  } else if (error !== null && typeof error === "object") {
    // Try to extract information from unknown object errors
    try {
      errorMessage = JSON.stringify(error);
    } catch {
      // If JSON stringification fails, use default message
    }
  }

  // ValidationError mapping
  if (error instanceof ValidationError) {
    return new McpError(
      ErrorCode.InvalidParams,
      `Validation error: ${errorMessage}`,
      errorDetails
    );
  }

  // NotFoundError mapping
  if (error instanceof NotFoundError) {
    return new McpError(
      ErrorCode.InvalidRequest,
      `Resource not found: ${errorMessage}`,
      errorDetails
    );
  }

  // ConfigurationError mapping
  if (error instanceof ConfigurationError) {
    return new McpError(
      ErrorCode.InternalError, // Changed from FailedPrecondition which is not in MCP SDK
      `Configuration error: ${errorMessage}`,
      errorDetails
    );
  }

  // Handle more specific Gemini API error subtypes first
  if (error instanceof GeminiResourceNotFoundError) {
    return new McpError(
      ErrorCode.InvalidRequest, // MCP SDK lacks NotFound, mapping to InvalidRequest
      `Resource not found: ${errorMessage}`,
      errorDetails
    );
  }

  if (error instanceof GeminiInvalidParameterError) {
    return new McpError(
      ErrorCode.InvalidParams,
      `Invalid parameters: ${errorMessage}`,
      errorDetails
    );
  }

  if (error instanceof GeminiAuthenticationError) {
    return new McpError(
      ErrorCode.InvalidRequest, // Changed from PermissionDenied which is not in MCP SDK
      `Authentication failed: ${errorMessage}`,
      errorDetails
    );
  }

  if (error instanceof GeminiQuotaExceededError) {
    return new McpError(
      ErrorCode.InternalError, // Changed from ResourceExhausted which is not in MCP SDK
      `Quota exceeded or rate limit hit: ${errorMessage}`,
      errorDetails
    );
  }

  if (error instanceof GeminiSafetyError) {
    return new McpError(
      ErrorCode.InvalidRequest,
      `Content blocked by safety settings: ${errorMessage}`,
      errorDetails
    );
  }

  // Generic GeminiApiError mapping with enhanced pattern detection
  if (error instanceof GeminiApiError) {
    // Convert message to lowercase for case-insensitive pattern matching
    const lowerCaseMessage = errorMessage.toLowerCase();

    // Handle rate limiting and quota errors
    if (
      lowerCaseMessage.includes("quota") ||
      lowerCaseMessage.includes("rate limit") ||
      lowerCaseMessage.includes("resource has been exhausted") ||
      lowerCaseMessage.includes("resource exhausted") ||
      lowerCaseMessage.includes("429") ||
      lowerCaseMessage.includes("too many requests")
    ) {
      return new McpError(
        ErrorCode.InternalError, // Changed from ResourceExhausted which is not in MCP SDK
        `Quota exceeded or rate limit hit: ${errorMessage}`,
        errorDetails
      );
    }

    // Handle permission and authorization errors
    if (
      lowerCaseMessage.includes("permission") ||
      lowerCaseMessage.includes("not authorized") ||
      lowerCaseMessage.includes("unauthorized") ||
      lowerCaseMessage.includes("forbidden") ||
      lowerCaseMessage.includes("403") ||
      lowerCaseMessage.includes("access denied")
    ) {
      return new McpError(
        ErrorCode.InvalidRequest, // Changed from PermissionDenied which is not in MCP SDK
        `Permission denied: ${errorMessage}`,
        errorDetails
      );
    }

    // Handle not found errors
    if (
      lowerCaseMessage.includes("not found") ||
      lowerCaseMessage.includes("does not exist") ||
      lowerCaseMessage.includes("404") ||
      lowerCaseMessage.includes("could not find") ||
      lowerCaseMessage.includes("no such file")
    ) {
      return new McpError(
        ErrorCode.InvalidRequest, // MCP SDK lacks NotFound, mapping to InvalidRequest
        `Resource not found: ${errorMessage}`,
        errorDetails
      );
    }

    // Handle invalid argument/parameter errors
    if (
      lowerCaseMessage.includes("invalid argument") ||
      lowerCaseMessage.includes("invalid parameter") ||
      lowerCaseMessage.includes("invalid request") ||
      lowerCaseMessage.includes("failed precondition") ||
      lowerCaseMessage.includes("400") ||
      lowerCaseMessage.includes("bad request") ||
      lowerCaseMessage.includes("malformed")
    ) {
      return new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${errorMessage}`,
        errorDetails
      );
    }

    // Handle safety-related errors
    if (
      lowerCaseMessage.includes("safety") ||
      lowerCaseMessage.includes("blocked") ||
      lowerCaseMessage.includes("content policy") ||
      lowerCaseMessage.includes("harmful") ||
      lowerCaseMessage.includes("inappropriate") ||
      lowerCaseMessage.includes("offensive")
    ) {
      return new McpError(
        ErrorCode.InvalidRequest,
        `Content blocked by safety settings: ${errorMessage}`,
        errorDetails
      );
    }

    // Handle File API and other unsupported feature errors
    if (
      lowerCaseMessage.includes("file api is not supported") ||
      lowerCaseMessage.includes("not supported") ||
      lowerCaseMessage.includes("unsupported") ||
      lowerCaseMessage.includes("not implemented")
    ) {
      return new McpError(
        ErrorCode.InvalidRequest, // Changed from FailedPrecondition which is not in MCP SDK
        `Operation not supported: ${errorMessage}`,
        errorDetails
      );
    }

    // Default case for GeminiApiError - map to internal error
    return new McpError(
      ErrorCode.InternalError,
      `Gemini API Error: ${errorMessage}`,
      errorDetails
    );
  }

  // Generic ServiceError mapping
  if (error instanceof ServiceError) {
    return new McpError(
      ErrorCode.InternalError,
      `Service error: ${errorMessage}`,
      errorDetails
    );
  }

  // Default case for all other errors
  return new McpError(
    ErrorCode.InternalError,
    `[${toolName}] Failed: ${errorMessage}`
  );
}

/**
 * Combined error mapping function that handles both standard errors and ToolError instances.
 * This function accommodates the different error types used across different tool implementations.
 *
 * @param error - Any error type, including McpError, BaseError, ToolError, or standard Error
 * @param toolName - The name of the tool where the error occurred
 * @returns McpError - A consistently mapped MCP error
 */
export function mapAnyErrorToMcpError(
  error: unknown,
  toolName: string
): McpError {
  // Check if error is a ToolError from image feature tools
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as ToolErrorLike).code === "string"
  ) {
    // For objects that match the ToolError interface
    return mapToolErrorToMcpError(error as ToolErrorLike, toolName);
  }

  // For standard errors and BaseError types
  return mapToMcpError(error, toolName);
}

/**
 * Interface for objects that conform to the ToolError structure
 * This provides type safety for objects that have a similar structure to ToolError
 * but may not be actual instances of the ToolError class.
 */
export interface ToolErrorLike {
  code?: string;
  message?: string;
  details?: unknown;
  [key: string]: unknown; // Allow additional properties for flexibility
}

// These tools use a different error structure than the rest of the application
// but need to maintain consistent error mapping to McpError

/**
 * Maps ToolError instances used in some image feature tools to McpError.
 * This is a compatibility layer for tools that use a different error structure.
 *
 * @param toolError - The ToolError instance or object with code/details properties
 * @param toolName - The name of the tool for better error messages
 * @returns McpError - A consistent MCP error
 */
export function mapToolErrorToMcpError(
  toolError: ToolErrorLike | unknown,
  toolName: string
): McpError {
  // Default message if more specific extraction fails
  let errorMessage = `Error in ${toolName}`;
  let errorDetails: unknown = undefined;

  // Extract error message and details if possible
  if (toolError && typeof toolError === "object") {
    const errorObj = toolError as ToolErrorLike;

    // Extract message
    if ("message" in errorObj && typeof errorObj.message === "string") {
      errorMessage = errorObj.message;
    }

    // Extract details
    if ("details" in errorObj) {
      errorDetails = errorObj.details;
    }

    // Extract code for mapping
    if ("code" in errorObj && typeof errorObj.code === "string") {
      const code = errorObj.code.toUpperCase();

      // Map common ToolError codes to appropriate ErrorCode values
      if (code.includes("SAFETY") || code.includes("BLOCKED")) {
        return new McpError(
          ErrorCode.InvalidRequest,
          `Content blocked by safety settings: ${errorMessage}`,
          errorDetails
        );
      }

      if (code.includes("QUOTA") || code.includes("RATE_LIMIT")) {
        return new McpError(
          ErrorCode.InternalError, // Changed from ResourceExhausted which is not in MCP SDK
          `API quota or rate limit exceeded: ${errorMessage}`,
          errorDetails
        );
      }

      if (code.includes("PERMISSION") || code.includes("AUTH")) {
        return new McpError(
          ErrorCode.InvalidRequest, // Changed from PermissionDenied which is not in MCP SDK
          `Permission denied: ${errorMessage}`,
          errorDetails
        );
      }

      if (code.includes("NOT_FOUND")) {
        return new McpError(
          ErrorCode.InvalidRequest,
          `Resource not found: ${errorMessage}`,
          errorDetails
        );
      }

      if (code.includes("INVALID") || code.includes("ARGUMENT")) {
        return new McpError(
          ErrorCode.InvalidParams,
          `Invalid parameters: ${errorMessage}`,
          errorDetails
        );
      }

      if (code.includes("UNSUPPORTED") || code.includes("NOT_SUPPORTED")) {
        return new McpError(
          ErrorCode.InvalidRequest, // Changed from FailedPrecondition which is not in MCP SDK
          `Operation not supported: ${errorMessage}`,
          errorDetails
        );
      }
    }
  }

  // Default to internal error for any other case
  return new McpError(
    ErrorCode.InternalError,
    `[${toolName}] Error: ${errorMessage}`,
    errorDetails
  );
}
