# MongoDB Atlas Cluster Provisioning

Clean React application for creating real MongoDB Atlas M10 clusters via Frontend → MCP Server → MongoDB Atlas architecture.

## Architecture

```
React Frontend (Port 5000) → MCP Server (Port 3001) → MongoDB Atlas API → Real M10 Clusters
```

## Project Structure

- `client/` - React frontend with MongoDB Atlas UI
- `server/` - Express server for frontend
- `mcp-server.cjs` - MCP server for Atlas API communication
- Essential configuration files only

## Features

- Direct MongoDB Atlas cluster creation
- Fixed M10 tier, Azure cloud, ap-south-2 region  
- Real-time cluster provisioning
- IP-filtered logging for clean output
- Configured for project: 688ba44a7f3cd609ef39f683

## Local Development

Ready-to-use package available as `mongodb-atlas-provisioning-local.tar.gz` with automated setup script and your Atlas credentials pre-configured.

This Replit version demonstrates the UI and architecture, with IP restrictions blocking Atlas API calls as expected.