#!/usr/bin/env node

// Import the MCP SDK server module
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HttpServerTransport } from "@modelcontextprotocol/sdk/server/transports/http.js";
import { z } from "zod";
import express from "express";
import cors from "cors";

// Create a new MCP server
const server = new McpServer();

// Register the same tools as in the stdio version
server.tool(
  "echoTool",
  "A tool that echoes back the input message",
  {
    message: z.string().describe("The message to echo"),
  },
  async (args) => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ 
            message: args.message,
            timestamp: new Date().toISOString()
          }, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "addTool",
  "A tool that adds two numbers",
  {
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  },
  async (args) => {
    const sum = args.a + args.b;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ 
            sum,
            inputs: { a: args.a, b: args.b }
          }, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "complexDataTool",
  "A tool that returns a complex JSON structure",
  {
    depth: z.number().optional().describe("Depth of nested objects to generate"),
    itemCount: z.number().optional().describe("Number of items to generate in arrays"),
  },
  async (args) => {
    const depth = args.depth || 3;
    const itemCount = args.itemCount || 2;
    
    // Generate a nested structure of specified depth
    function generateNestedData(currentDepth) {
      if (currentDepth <= 0) {
        return { value: "leaf data" };
      }
      
      const result = {
        level: depth - currentDepth + 1,
        timestamp: new Date().toISOString(),
        items: []
      };
      
      for (let i = 0; i < itemCount; i++) {
        result.items.push(generateNestedData(currentDepth - 1));
      }
      
      return result;
    }
    
    const data = generateNestedData(depth);
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

// Create Express app and add CORS middleware
const app = express();
app.use(cors());
app.use(express.json());

// Get port from command line argument or environment or default to 3456
const port = process.argv[2] || process.env.PORT || 3456;

// Create HTTP server
const httpServer = app.listen(port, () => {
  console.error(`Dummy MCP Server (SSE) started on port ${port}`);
});

// Connect a HttpServerTransport
const transport = new HttpServerTransport({
  server,
  app,
  path: "/mcp",
});
transport.connect();

// Add a handler for Ctrl+C to properly shut down the server
process.on('SIGINT', () => {
  console.error('Shutting down Dummy MCP Server (SSE)...');
  httpServer.close(() => {
    process.exit(0);
  });
});