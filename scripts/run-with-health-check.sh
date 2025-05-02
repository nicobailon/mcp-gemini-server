#!/bin/bash
# Script to run the MCP server with health check enabled on a specific port
# Usage: ./scripts/run-with-health-check.sh [port]

# Default port if not specified
HEALTH_PORT=${1:-3000}

# Run the server with health check enabled
ENABLE_HEALTH_CHECK=true HEALTH_CHECK_PORT=$HEALTH_PORT node dist/server.js
