# MCP Server Setup Guide

## Quick Start

1. **Start the MCP Server:**
   ```bash
   ./start-mcp-server.sh
   ```

2. **Or manually start:**
   ```bash
   node mcp-server.cjs
   ```

## What This Fixes

- **Provisioning Failed Error**: The "Unexpected token '<', '<!DOCTYPE \"... is not valid JSON" error occurs when the MCP server isn't running
- **Excessive Logging**: Removed verbose logging that was cluttering the console
- **Better Error Handling**: Added proper error messages and validation
- **Health Checks**: Frontend now shows MCP server status

## Server Endpoints

- `POST /create-cluster` - Create a new MongoDB cluster
- `GET /api/cluster-status?id=<id>` - Get cluster creation status
- `POST /api/populate-data` - Populate sample data
- `POST /api/view-data` - View cluster data
- `GET /health` - Server health check
- `GET /api/clusters` - List all cluster requests

## Troubleshooting

### If you see "MCP Server Offline":
1. Make sure the MCP server is running on port 3001
2. Check if port 3001 is already in use
3. Run `./start-mcp-server.sh` to restart the server

### If cluster creation still fails:
1. Check the MCP server console for error messages
2. Verify your MongoDB Atlas credentials in the `.env` file
3. Ensure the MCP server has network access to MongoDB Atlas

## Port Configuration

The MCP server runs on port 3001 by default. If you need to change this:

1. Set the `MCP_SERVER_PORT` environment variable
2. Update the Vite proxy configuration in `vite.config.ts`
3. Restart both the MCP server and the frontend dev server

## Logs

The MCP server now has clean, minimal logging. You'll see:
- Server startup messages
- Cluster creation progress
- Error messages (when they occur)
- Health check status
