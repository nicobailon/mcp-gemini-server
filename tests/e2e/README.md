# E2E Tests for MCP Gemini Server

## Overview

End-to-end tests should be separated from unit tests and run with real clients and servers. This directory contains examples and instructions for setting up E2E tests.

## Structure

```
tests/e2e/
├── README.md                    # This file
├── fixtures/                    # Test data and configurations
├── clients/                     # Test client implementations
│   └── mcp-test-client.ts      # MCP protocol test client
└── scenarios/                   # Test scenarios
    ├── basic-flow.test.ts      # Basic initialization and tool calling
    ├── streaming.test.ts       # Streaming response tests
    └── session-management.test.ts # Session lifecycle tests
```

## Running E2E Tests

E2E tests should be run separately from unit tests:

```bash
# Run unit tests (fast, mocked)
npm run test

# Run E2E tests (slower, real servers)
npm run test:e2e
```

## Example E2E Test

```typescript
import { MCPTestClient } from './clients/mcp-test-client';
import { startServer } from './helpers/server-helper';

describe('E2E: Basic MCP Flow', () => {
  let server: any;
  let client: MCPTestClient;

  beforeAll(async () => {
    // Start real server
    server = await startServer({
      transport: 'streamable',
      port: 3001
    });

    // Create real client
    client = new MCPTestClient({
      url: 'http://localhost:3001/mcp'
    });
  });

  afterAll(async () => {
    await client.disconnect();
    await server.stop();
  });

  it('should complete full MCP flow', async () => {
    // 1. Initialize
    const initResult = await client.initialize();
    expect(initResult.protocolVersion).toBe('2024-11-05');

    // 2. List tools
    const tools = await client.listTools();
    expect(tools).toContain(
      expect.objectContaining({ name: 'gemini_generateContent' })
    );

    // 3. Call tool
    const result = await client.callTool('gemini_generateContent', {
      prompt: 'Hello',
      modelName: 'gemini-1.5-flash'
    });
    expect(result).toBeDefined();
  });
});
```

## Test Client Implementation

The test client should implement the full MCP protocol:

```typescript
export class MCPTestClient {
  private sessionId?: string;
  private url: string;

  constructor(options: { url: string }) {
    this.url = options.url;
  }

  async initialize(): Promise<any> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      })
    });

    this.sessionId = response.headers.get('Mcp-Session-Id') || undefined;
    return this.parseResponse(response);
  }

  // ... other methods
}
```

## Benefits of E2E Testing

1. **Real Protocol Testing**: Tests actual MCP protocol implementation
2. **Integration Verification**: Ensures all components work together
3. **Performance Testing**: Can measure real-world performance
4. **Regression Prevention**: Catches issues unit tests might miss

## Current Status

E2E tests are not yet implemented. When implementing:

1. Use a real MCP client library if available
2. Test against multiple transport types
3. Include error scenarios and edge cases
4. Add performance benchmarks
5. Consider using Docker for isolated test environments