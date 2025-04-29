// Import test utilities
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BaseError,
  ValidationError,
  NotFoundError,
  ConfigurationError,
  ServiceError,
  GeminiApiError,
  mapToMcpError,
} from './errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

describe('mapToMcpError', () => {
  const TOOL_NAME = 'test_tool';

  it('should return McpError instances directly', () => {
    const originalError = new McpError(
      ErrorCode.InvalidParams,
      'Original MCP error'
    );
    const mappedError = mapToMcpError(originalError, TOOL_NAME);
    assert.strictEqual(mappedError, originalError);
  });

  it('should map ValidationError to InvalidParams', () => {
    const validationError = new ValidationError('Invalid input');
    const mappedError = mapToMcpError(validationError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InvalidParams);
    assert.ok(mappedError.message.includes('Validation error'));
    assert.ok(mappedError.message.includes('Invalid input'));
  });

  it('should map NotFoundError to InvalidRequest', () => {
    const notFoundError = new NotFoundError('Resource not found');
    const mappedError = mapToMcpError(notFoundError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InvalidRequest);
    assert.ok(mappedError.message.includes('Resource not found'));
  });

  it('should map ConfigurationError to InternalError', () => {
    const configError = new ConfigurationError('Invalid configuration');
    const mappedError = mapToMcpError(configError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InternalError); // Changed from FailedPrecondition
    assert.ok(mappedError.message.includes('Configuration error'));
    assert.ok(mappedError.message.includes('Invalid configuration'));
  });

  it('should map quota-related GeminiApiError to InternalError', () => {
    const quotaError = new GeminiApiError('Quota exceeded for this resource');
    const mappedError = mapToMcpError(quotaError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InternalError); // Changed from ResourceExhausted
    assert.ok(mappedError.message.includes('Quota exceeded'));
  });

  it('should map rate limit GeminiApiError to InternalError', () => {
    const rateLimitError = new GeminiApiError('Rate limit hit for this operation');
    const mappedError = mapToMcpError(rateLimitError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InternalError); // Changed from ResourceExhausted
    assert.ok(mappedError.message.includes('rate limit hit'));
  });

  it('should map permission-related GeminiApiError to InvalidRequest', () => {
    const permissionError = new GeminiApiError('Permission denied for this operation');
    const mappedError = mapToMcpError(permissionError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InvalidRequest); // Changed from PermissionDenied
    assert.ok(mappedError.message.includes('Permission denied'));
  });

  it('should map not-found GeminiApiError to InvalidRequest', () => {
    const notFoundError = new GeminiApiError('Resource does not exist');
    const mappedError = mapToMcpError(notFoundError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InvalidRequest);
    assert.ok(mappedError.message.includes('Resource not found'));
  });

  it('should map invalid argument GeminiApiError to InvalidParams', () => {
    const invalidParamError = new GeminiApiError('Invalid argument provided');
    const mappedError = mapToMcpError(invalidParamError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InvalidParams);
    assert.ok(mappedError.message.includes('Invalid parameters'));
  });

  it('should map safety-related GeminiApiError to InvalidRequest', () => {
    const safetyError = new GeminiApiError('Content blocked by safety settings');
    const mappedError = mapToMcpError(safetyError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InvalidRequest);
    assert.ok(mappedError.message.includes('Content blocked by safety settings'));
  });

  it('should map File API not supported errors to InvalidRequest', () => {
    const apiError = new GeminiApiError('File API is not supported on Vertex AI');
    const mappedError = mapToMcpError(apiError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InvalidRequest); // Changed from FailedPrecondition
    assert.ok(mappedError.message.includes('Operation not supported'));
  });

  it('should map other GeminiApiError to InternalError', () => {
    const otherApiError = new GeminiApiError('Unknown API error');
    const mappedError = mapToMcpError(otherApiError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InternalError);
    assert.ok(mappedError.message.includes('Gemini API Error'));
  });

  it('should map ServiceError to InternalError', () => {
    const serviceError = new ServiceError('Service processing failed');
    const mappedError = mapToMcpError(serviceError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InternalError);
    assert.ok(mappedError.message.includes('Service error'));
  });

  it('should map standard Error to InternalError', () => {
    const standardError = new Error('Standard error occurred');
    const mappedError = mapToMcpError(standardError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InternalError);
    assert.ok(mappedError.message.includes(TOOL_NAME));
    assert.ok(mappedError.message.includes('Standard error occurred'));
  });

  it('should handle string errors', () => {
    const stringError = 'String error message';
    const mappedError = mapToMcpError(stringError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InternalError);
    assert.ok(mappedError.message.includes(stringError));
  });

  it('should handle object errors', () => {
    const objectError = { errorCode: 500, message: 'Object error' };
    const mappedError = mapToMcpError(objectError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InternalError);
    // Should contain stringified version of the object
    assert.ok(mappedError.message.includes('Object error'));
  });

  it('should handle null/undefined errors', () => {
    const nullError = null;
    const mappedError = mapToMcpError(nullError, TOOL_NAME);
    
    assert.ok(mappedError instanceof McpError);
    assert.strictEqual(mappedError.code, ErrorCode.InternalError);
    assert.ok(mappedError.message.includes('An unknown error occurred'));
  });

  it('should preserve error details when available', () => {
    const errorWithDetails = new GeminiApiError('API error with details', { key: 'value' });
    const mappedError = mapToMcpError(errorWithDetails, TOOL_NAME);
    
    // Assert that the details property exists
    assert.ok(mappedError.hasOwnProperty('details'));
    
    // Assert that it contains the expected value
    const mappedErrorAny = mappedError as any;
    assert.deepStrictEqual(mappedErrorAny.details, { key: 'value' });
  });
});
