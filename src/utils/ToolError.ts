/**
 * Custom error class for tool-specific errors.
 * This is used by image feature tools and maintains compatibility
 * with the error mapping system.
 */
export class ToolError extends Error {
  public code: string;
  public readonly details?: unknown;

  constructor(message: string, options?: { code?: string; details?: unknown }) {
    super(message);
    this.name = "ToolError";
    this.code = options?.code || "TOOL_ERROR";
    this.details = options?.details;

    // Capture stack trace (excluding constructor)
    Error.captureStackTrace(this, this.constructor);
  }
}
