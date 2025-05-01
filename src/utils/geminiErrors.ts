/**
 * Enhanced error types for Gemini API operations
 * Provides more structured and specific error handling
 */

import { logger } from "./logger.js";

/**
 * Base error class for all Gemini-related errors
 */
export class GeminiApiError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "GeminiApiError";
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
    
    // Log the error for monitoring
    logger.error(`${this.name}: ${message}`, { cause });
  }
}

/**
 * Error for authentication and authorization issues
 */
export class GeminiAuthError extends GeminiApiError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "GeminiAuthError";
  }
}

/**
 * Error for API rate limiting and quota issues
 */
export class GeminiQuotaError extends GeminiApiError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "GeminiQuotaError";
  }
}

/**
 * Error for content safety filtering
 */
export class GeminiContentFilterError extends GeminiApiError {
  constructor(
    message: string, 
    public readonly categories?: string[],
    cause?: unknown
  ) {
    super(message, cause);
    this.name = "GeminiContentFilterError";
  }
}

/**
 * Error for invalid parameters
 */
export class GeminiValidationError extends GeminiApiError {
  constructor(message: string, public readonly field?: string, cause?: unknown) {
    super(message, cause);
    this.name = "GeminiValidationError";
  }
}

/**
 * Error for network issues
 */
export class GeminiNetworkError extends GeminiApiError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "GeminiNetworkError";
  }
}

/**
 * Error for model-specific issues
 */
export class GeminiModelError extends GeminiApiError {
  constructor(message: string, public readonly modelName?: string, cause?: unknown) {
    super(message, cause);
    this.name = "GeminiModelError";
  }
}

/**
 * Maps an error to the appropriate Gemini error type
 * @param error The original error 
 * @param context Additional context about the operation
 * @returns A properly typed Gemini error
 */
export function mapGeminiError(error: unknown, context?: string): GeminiApiError {
  // Handle different error types based on the error properties
  if (error instanceof GeminiApiError) {
    // Already a GeminiApiError, just return it
    return error;
  }
  
  // Convert to Error type if it's not already
  const err = error instanceof Error ? error : new Error(String(error));
  
  // Determine error type based on message and status
  const message = err.message.toLowerCase();
  
  // Build context-aware error message
  const contextMsg = context ? `[${context}] ` : '';
  
  if (message.includes('unauthorized') || message.includes('permission') || message.includes('api key')) {
    return new GeminiAuthError(`${contextMsg}Authentication failed: ${err.message}`, err);
  }
  
  if (message.includes('quota') || message.includes('rate limit') || message.includes('too many requests')) {
    return new GeminiQuotaError(`${contextMsg}API quota exceeded: ${err.message}`, err);
  }
  
  if (message.includes('safety') || message.includes('blocked') || message.includes('harmful') || message.includes('inappropriate')) {
    return new GeminiContentFilterError(`${contextMsg}Content filtered: ${err.message}`, undefined, err);
  }
  
  if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
    return new GeminiValidationError(`${contextMsg}Validation error: ${err.message}`, undefined, err);
  }
  
  if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
    return new GeminiNetworkError(`${contextMsg}Network error: ${err.message}`, err);
  }
  
  if (message.includes('model') || message.includes('not found') || message.includes('unsupported')) {
    return new GeminiModelError(`${contextMsg}Model error: ${err.message}`, undefined, err);
  }
  
  // Default case: return a generic GeminiApiError
  return new GeminiApiError(`${contextMsg}${err.message}`, err);
}

/**
 * Helper to provide common error messages for Gemini operations
 */
export const GeminiErrorMessages = {
  // General errors
  GENERAL_ERROR: "An error occurred while processing your request",
  TIMEOUT_ERROR: "The request timed out. Please try again later",
  
  // Authentication errors
  INVALID_API_KEY: "Invalid or missing API key",
  API_KEY_EXPIRED: "API key has expired",
  
  // Quota errors
  QUOTA_EXCEEDED: "API quota has been exceeded for the current period",
  RATE_LIMIT_EXCEEDED: "Too many requests. Please try again later",
  
  // Content filter errors
  CONTENT_FILTERED: "Content was filtered due to safety settings",
  UNSAFE_PROMPT: "The prompt was flagged as potentially unsafe",
  UNSAFE_CONTENT: "Generated content was flagged as potentially unsafe",
  
  // Validation errors
  INVALID_PROMPT: "Invalid prompt format or content",
  INVALID_PARAMETERS: "One or more parameters are invalid",
  
  // Network errors
  NETWORK_ERROR: "Network error. Please check your internet connection",
  CONNECTION_FAILED: "Failed to connect to the Gemini API",
  
  // Model errors
  MODEL_NOT_FOUND: "The specified model was not found",
  UNSUPPORTED_MODEL: "The specified model does not support this operation",
  UNSUPPORTED_FORMAT: "The requested format is not supported by this model"
};