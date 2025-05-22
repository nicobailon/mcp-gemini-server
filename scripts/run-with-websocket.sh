#!/bin/bash
# Script to run the MCP server with WebSocket transport
# Usage: ./scripts/run-with-websocket.sh [port]

# Default port if not specified
WS_PORT=${1:-8080}

# Run the server with WebSocket transport
MCP_TRANSPORT=ws MCP_SERVER_PORT=$WS_PORT node dist/server.js
