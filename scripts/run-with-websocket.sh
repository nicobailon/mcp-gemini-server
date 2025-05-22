#!/bin/bash
# Script to run the MCP server with WebSocket transport
# Usage: ./scripts/run-with-websocket.sh [port]

# Default port if not specified
WS_PORT=${1:-8080}

# Run the server with WebSocket transport
# Using current environment variables (not deprecated ones):
# - MCP_TRANSPORT (current) instead of MCP_TRANSPORT_TYPE (deprecated)
# - MCP_SERVER_PORT (current) instead of MCP_WS_PORT (deprecated)
# Note: Both "ws" and "sse" values use WebSocketServerTransport, but "ws" 
# logs as "WebSocket transport" which matches this script's purpose
MCP_TRANSPORT=ws MCP_SERVER_PORT=$WS_PORT node dist/server.js
