#!/bin/bash

echo "Starting MCP Server..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if the MCP server file exists
if [ ! -f "mcp-server.cjs" ]; then
    echo "Error: mcp-server.cjs not found in current directory."
    exit 1
fi

# Check if port 3001 is already in use
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
    echo "Port 3001 is already in use. Stopping existing process..."
    lsof -ti:3001 | xargs kill -9
    sleep 2
fi

# Start the MCP server
echo "Starting MCP Server on port 3001..."
node mcp-server.cjs

echo "MCP Server stopped."
