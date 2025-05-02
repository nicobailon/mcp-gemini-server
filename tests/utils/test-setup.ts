/**
 * Test setup utilities for MCP Gemini Server tests
 *
 * This file provides helper functions for setting up and tearing down the server during tests,
 * as well as creating test fixtures and mock objects.
 */

import { Server } from "node:http";
import { AddressInfo } from "node:net";
import { setTimeout } from "node:timers/promises";

/**
 * Options for creating a test server
 */
export interface TestServerOptions {
  /** Port to run the server on (0 for random port) */
  port?: number;
  /** API key to use (defaults to environment variable) */
  apiKey?: string;
  /** Default model to use for tests */
  defaultModel?: string;
  /** Base directory for file operations during tests */
  fileBasePath?: string;
  /** Whether to use verbose logging during tests */
  verbose?: boolean;
}

/**
 * Context object returned by setupTestServer
 */
export interface TestServerContext {
  /** The HTTP server instance */
  server: Server;
  /** The base URL to connect to the server */
  baseUrl: string;
  /** Port the server is running on */
  port: number;
  /** Function to cleanly shut down the server */
  teardown: () => Promise<void>;
}

/**
 * Sets up a test server with the specified options
 *
 * @param options - Configuration options for the test server
 * @returns TestServerContext object with server and helper methods
 */
export async function setupTestServer(
  options: TestServerOptions = {}
): Promise<TestServerContext> {
  // Save original environment variables
  const originalEnv = {
    GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
    GOOGLE_GEMINI_MODEL: process.env.GOOGLE_GEMINI_MODEL,
    GEMINI_SAFE_FILE_BASE_DIR: process.env.GEMINI_SAFE_FILE_BASE_DIR,
    NODE_ENV: process.env.NODE_ENV,
  };

  // Set test environment variables
  process.env.NODE_ENV = "test";
  if (options.apiKey) {
    process.env.GOOGLE_GEMINI_API_KEY = options.apiKey;
  }
  if (options.defaultModel) {
    process.env.GOOGLE_GEMINI_MODEL = options.defaultModel;
  }
  if (options.fileBasePath) {
    process.env.GEMINI_SAFE_FILE_BASE_DIR = options.fileBasePath;
  }

  // Import server creation functions
  const { createServer } = await import("../../src/createServer.js");
  const http = await import("node:http");

  // Create MCP server instance
  const mcpServer = createServer();

  // Create an HTTP server using the MCP server handler
  const port = options.port || 0;
  const httpServer = http.createServer((req, res) => {
    // Pass requests to the MCP server
    mcpServer(req, res);
  });

  // Start the HTTP server
  httpServer.listen(port);

  // Wait for the server to be ready
  await new Promise<void>((resolve) => {
    httpServer.once("listening", () => resolve());
  });

  // Get the actual port (in case it was randomly assigned)
  const actualPort = (httpServer.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${actualPort}`;

  // Return the context with server and helper methods
  return {
    server: httpServer,
    baseUrl,
    port: actualPort,
    teardown: async () => {
      // Close the HTTP server
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err: Error | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Restore original environment variables
      process.env.GOOGLE_GEMINI_API_KEY = originalEnv.GOOGLE_GEMINI_API_KEY;
      process.env.GOOGLE_GEMINI_MODEL = originalEnv.GOOGLE_GEMINI_MODEL;
      process.env.GEMINI_SAFE_FILE_BASE_DIR =
        originalEnv.GEMINI_SAFE_FILE_BASE_DIR;
      process.env.NODE_ENV = originalEnv.NODE_ENV;

      // Small delay to ensure cleanup completes
      await setTimeout(100);
    },
  };
}

/**
 * Creates a mock API response object for testing
 *
 * @param status - HTTP status code to return
 * @param data - Response data
 * @returns Mock response object
 */
export function createMockResponse(status: number, data: unknown): any {
  return {
    status,
    data,
    headers: {},
    config: {},
    request: {},
  };
}

/**
 * Check if required environment variables for testing are available
 *
 * @param requiredVars - Array of required environment variable names
 * @returns true if all variables are available, false otherwise
 */
export function checkRequiredEnvVars(
  requiredVars: string[] = ["GOOGLE_GEMINI_API_KEY"]
): boolean {
  const missing = requiredVars.filter((varName) => !process.env[varName]);
  if (missing.length > 0) {
    console.warn(
      `Missing required environment variables for testing: ${missing.join(", ")}`
    );
    console.warn(
      "Create a .env.test file or set these variables in your environment"
    );
    return false;
  }
  return true;
}

/**
 * Skip a test if required environment variables are missing
 *
 * @param t - Test context
 * @param requiredVars - Array of required environment variable names
 * @returns Whether the test should be skipped
 */
export function skipIfMissingEnvVars(
  t: any,
  requiredVars: string[] = ["GOOGLE_GEMINI_API_KEY"]
): boolean {
  const missing = requiredVars.filter((varName) => !process.env[varName]);
  if (missing.length > 0) {
    t.skip(`Test requires environment variables: ${missing.join(", ")}`);
    return true;
  }
  return false;
}
