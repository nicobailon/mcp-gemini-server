import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { REQUIRED_ENV_VARS } from "../utils/environment.js";
import { skipIfMissingEnvVars } from "../utils/test-setup.js";
import EventSource from "eventsource";

// Mock uuid to ensure predictable session IDs for testing
vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-session-id"),
}));

describe("Streamable HTTP Transport Integration", () => {
  let serverProcess: ChildProcess | null = null;
  const testPort = 3001;
  const mcpEndpoint = "/mcp";
  const mcpUrl = `http://localhost:${testPort}${mcpEndpoint}`;

  // Store original environment variables to restore them after tests
  const originalEnv = process.env;

  beforeEach(async () => {
    // Set environment variables for this test suite
    process.env = {
      ...originalEnv,
      MCP_TRANSPORT: "streamable",
      MCP_SERVER_PORT: testPort.toString(),
      MCP_ENABLE_STREAMING: "true",
      MCP_SESSION_TIMEOUT: "60", // Short timeout for testing session expiration
      GOOGLE_GEMINI_API_KEY:
        process.env.GOOGLE_GEMINI_API_KEY || "test-api-key",
      GOOGLE_GEMINI_MODEL: "gemini-1.5-flash",
      NODE_ENV: "test",
    };

    // Start the actual server process
    await startServerProcess();
  });

  afterEach(async () => {
    // Stop the server process
    if (serverProcess) {
      await stopServerProcess();
    }
    process.env = originalEnv; // Restore original environment variables
    vi.restoreAllMocks();
  });

  async function startServerProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Spawn the server process using the compiled JavaScript
      serverProcess = spawn("node", ["dist/src/index.js"], {
        env: process.env,
        stdio: "pipe", // Capture output for debugging
      });

      let serverReady = false;
      const timeout = globalThis.setTimeout(() => {
        if (!serverReady) {
          reject(new Error("Server startup timeout"));
        }
      }, 10000); // 10 second timeout

      // Listen for server ready indication
      serverProcess!.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        console.log(`Server stdout: ${output}`);

        // Look for indication that HTTP server is ready
        if (
          output.includes("HTTP server listening") ||
          output.includes(`port ${testPort}`) ||
          output.includes("MCP Server connected and listening")
        ) {
          serverReady = true;
          clearTimeout(timeout);
          resolve();
        }
      });

      serverProcess!.stderr?.on("data", (data: Buffer) => {
        const output = data.toString();
        console.error(`Server stderr: ${output}`);
      });

      serverProcess!.on("error", (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start server: ${error.message}`));
      });

      serverProcess!.on("exit", (code, signal) => {
        clearTimeout(timeout);
        if (!serverReady) {
          reject(
            new Error(`Server exited early with code ${code}, signal ${signal}`)
          );
        }
      });

      // Give the server a moment to start up even if we don't see the ready message
      globalThis.setTimeout(() => {
        if (!serverReady) {
          console.log(
            "Server ready message not detected, proceeding with assumption it's ready"
          );
          serverReady = true;
          clearTimeout(timeout);
          resolve();
        }
      }, 3000);
    });
  }

  async function stopServerProcess(): Promise<void> {
    if (!serverProcess) return;

    return new Promise((resolve) => {
      const killTimeout = globalThis.setTimeout(() => {
        // Force kill if graceful shutdown takes too long
        serverProcess!.kill("SIGKILL");
        resolve();
      }, 5000);

      serverProcess!.on("exit", () => {
        clearTimeout(killTimeout);
        serverProcess = null;
        resolve();
      });

      // Try graceful shutdown first
      serverProcess!.kill("SIGTERM");
    });
  }

  async function waitForServerReady(): Promise<void> {
    // Poll the health endpoint or basic connectivity
    for (let i = 0; i < 50; i++) {
      try {
        // Try to connect to the MCP endpoint first
        const response = await fetch(`http://localhost:${testPort}/mcp`, {
          method: "OPTIONS",
        });
        if (response.status === 204 || response.status === 200) {
          console.log("Server is ready - MCP endpoint responding");
          return;
        }
      } catch (error) {
        // If MCP endpoint fails, try health check
        try {
          const healthResponse = await fetch(
            `http://localhost:${testPort}/health`,
            {
              method: "GET",
            }
          );
          if (healthResponse.ok) {
            console.log("Server is ready - health endpoint responding");
            return;
          }
        } catch (healthError) {
          // Both endpoints not ready yet, continue polling
        }
      }
      await sleep(300); // Wait 300ms between polls
    }
    throw new Error("Server did not become ready within timeout period");
  }

  it("should handle HTTP POST requests for tool calls (non-streaming)", async () => {
    // Skip if no API key is set for actual service calls
    if (skipIfMissingEnvVars(it, REQUIRED_ENV_VARS.BASIC)) return;

    await waitForServerReady();

    // Call a non-streaming tool (e.g., gemini_generateContent)
    const response = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "req1",
        method: "tools/call",
        params: {
          name: "gemini_generateContent",
          arguments: {
            prompt: "Hello world",
            modelName: "gemini-1.5-flash",
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.id).toBe("req1");
    expect(result.result).toBeDefined();
    // Note: This will test against the actual Gemini API response structure
  });

  it("should handle SSE streaming for long-running operations", async () => {
    // Skip if no API key is set for actual service calls
    if (skipIfMissingEnvVars(it, REQUIRED_ENV_VARS.BASIC)) return;

    await waitForServerReady();

    const chunksReceived: string[] = [];
    let streamComplete = false;

    // Test SSE streaming by connecting to the server and triggering a streaming operation
    const es = new EventSource(mcpUrl);

    const streamPromise = new Promise<void>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        es.close();
        reject(new Error("SSE stream timeout"));
      }, 10000);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "chunk") {
            chunksReceived.push(data.content);
          } else if (data.type === "complete") {
            streamComplete = true;
            clearTimeout(timeout);
            es.close();
            resolve();
          }
        } catch (e) {
          clearTimeout(timeout);
          es.close();
          reject(new Error("Failed to parse SSE message: " + event.data));
        }
      };

      es.onerror = (error) => {
        clearTimeout(timeout);
        es.close();
        reject(new Error("SSE Error: " + JSON.stringify(error)));
      };
    });

    // Trigger a streaming operation
    const triggerResponse = await fetch(mcpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "req-stream",
        method: "tools/call",
        params: {
          name: "gemini_generateContentStream",
          arguments: {
            prompt: "Tell me a short story",
            modelName: "gemini-1.5-flash",
          },
        },
      }),
    });

    expect(triggerResponse.status).toBe(200);

    await streamPromise;

    expect(chunksReceived.length).toBeGreaterThan(0);
    expect(streamComplete).toBe(true);
  });

  it("should manage sessions with Mcp-Session-Id header", async () => {
    // Skip if no API key is set for actual service calls
    if (skipIfMissingEnvVars(it, REQUIRED_ENV_VARS.BASIC)) return;

    await waitForServerReady();

    let sessionId: string | null;

    // 1. Initial request to start a chat session
    const initResponse = await fetch(mcpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "init1",
        method: "tools/call",
        params: {
          name: "gemini_startChat",
          arguments: {
            modelName: "gemini-1.5-flash",
          },
        },
      }),
    });

    expect(initResponse.status).toBe(200);

    // Check for session ID in response headers
    // eslint-disable-next-line prefer-const
    sessionId = initResponse.headers.get("Mcp-Session-Id");
    expect(sessionId).toBeDefined();

    // 2. Subsequent request using the session ID
    const subsequentResponse = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Mcp-Session-Id": sessionId!,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "subsequent1",
        method: "tools/call",
        params: {
          name: "gemini_sendMessage",
          arguments: {
            sessionId: sessionId!, // Use the same session ID
            message: "Continue conversation",
          },
        },
      }),
    });

    expect(subsequentResponse.status).toBe(200);
    const result = await subsequentResponse.json();
    expect(result.id).toBe("subsequent1");
    expect(result.result).toBeDefined();
  });

  it("should handle CORS headers correctly", async () => {
    await waitForServerReady();

    const response = await fetch(mcpUrl, {
      method: "OPTIONS", // Preflight request
      headers: {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Mcp-Session-Id",
        Origin: "http://example.com",
      },
    });

    expect(response.status).toBe(204); // No Content for successful preflight
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "POST"
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "Content-Type"
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "Mcp-Session-Id"
    );
  });

  it("should handle server health check", async () => {
    await waitForServerReady();

    const response = await fetch(`http://localhost:${testPort}/health`, {
      method: "GET",
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.status).toBe("ok");
  });
});
