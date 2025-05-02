import { describe, test, after } from "node:test";
import { strict as assert } from "node:assert";
import http from "node:http";
import { getHealthStatus, setServerState, startHealthCheckServer, ServerState } from "../../../src/utils/healthCheck.js";

describe("Health Check", () => {
  let healthServer: http.Server;
  const testPort = 3333; // Use a specific port for tests
  // Store the original environment variable value
  const originalHealthCheckPort = process.env.HEALTH_CHECK_PORT;

  // Mock server state
  const mockServerState: ServerState = {
    isRunning: true,
    startTime: Date.now() - 5000, // 5 seconds ago
    transport: { constructor: { name: "MockTransport" } },
    server: {},
    healthCheckServer: null,
  };

  // Setup: Start health check server
  test("should initialize health check server", () => {
    setServerState(mockServerState);
    
    // Set the port via environment variable for our test
    process.env.HEALTH_CHECK_PORT = testPort.toString();
    
    healthServer = startHealthCheckServer();
    
    assert.ok(healthServer, "Health check server should be initialized");
    
    // Wait briefly for the server to start listening
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 100);
    });
  });

  // Test health status function
  test("should return correct health status", () => {
    const status = getHealthStatus();
    
    assert.equal(status.status, "running", "Status should be running");
    assert.ok(status.uptime >= 5, "Uptime should be at least 5 seconds");
    assert.equal(status.transport, "MockTransport", "Transport should be MockTransport");
  });

  // Test health endpoint
  test("should respond to health endpoint", async () => {
    // Make HTTP request to health endpoint
    const response = await new Promise<http.IncomingMessage>((resolve) => {
      const req = http.request({
        hostname: "localhost",
        port: testPort,
        path: "/health",
        method: "GET",
      }, (res) => {
        resolve(res);
      });
      
      req.end();
    });
    
    // Check response status
    assert.equal(response.statusCode, 200, "Health endpoint should return 200 OK");
    
    // Check response content
    const data = await new Promise<string>((resolve) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve(body);
      });
    });
    
    const healthData = JSON.parse(data);
    assert.equal(healthData.status, "running", "Health check should report running");
    assert.ok(healthData.uptime >= 0, "Uptime should be a number");
    assert.equal(healthData.transport, "MockTransport", "Transport should be reported correctly");
  });

  // Test 404 for unknown paths
  test("should return 404 for unknown paths", async () => {
    // Make HTTP request to unknown path
    const response = await new Promise<http.IncomingMessage>((resolve) => {
      const req = http.request({
        hostname: "localhost",
        port: testPort,
        path: "/unknown",
        method: "GET",
      }, (res) => {
        resolve(res);
      });
      
      req.end();
    });
    
    // Check response status
    assert.equal(response.statusCode, 404, "Unknown path should return 404 Not Found");
  });

  // Cleanup: Close server after tests
  after(() => {
    if (healthServer) {
      healthServer.close();
    }
    
    // Restore the environment variable or delete it if it wasn't set before
    if (originalHealthCheckPort === undefined) {
      delete process.env.HEALTH_CHECK_PORT;
    } else {
      process.env.HEALTH_CHECK_PORT = originalHealthCheckPort;
    }
  });
});
