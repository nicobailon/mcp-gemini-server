#!/usr/bin/env node

// Import the MCP SDK server module
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/transports/stdio.js";
import { z } from "zod";

// Create a new MCP server
const server = new McpServer();

// Register an echo tool
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

// Register an add tool
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

// Register a complex data tool that returns a nested JSON structure
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

// Connect a stdio transport
const transport = new StdioServerTransport(server);
transport.connect();

// Log a message to stderr
console.error("Dummy MCP Server (stdio) started");