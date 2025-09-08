# MongoDB Atlas Cluster Provisioning - Local Development

This project provides a simplified way to create and manage MongoDB Atlas clusters through a web interface, using an MCP (Model Context Protocol) server as an intermediary.

## 🏗️ Architecture

The application follows a **Frontend → MCP Server → MongoDB Atlas** flow:

```
Frontend (React) → MCP Server (Node.js) → MongoDB Atlas API
```

- **Frontend**: React application with TypeScript and Tailwind CSS
- **MCP Server**: Express.js server that handles cluster operations and communicates with MongoDB Atlas
- **MongoDB Atlas**: Cloud database service where clusters are provisioned

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables
Copy the environment template and add your MongoDB Atlas credentials:
```bash
cp env-template.txt .env
```

Edit `.env` and add your credentials:
```env
MONGODB_PUBLIC_KEY=your_public_key_here
MONGODB_PRIVATE_KEY=your_private_key_here
MONGODB_GROUP_ID=your_group_id_here
MCP_SERVER_PORT=3001
```

### 3. Start the MCP Server
```bash
./start-mcp-server.sh
```

The MCP server will start on port 3001 and handle all cluster operations.

### 4. Start the Frontend
```bash
npm run dev
```

The frontend will start on port 9001 and communicate directly with the MCP server.

## 🔧 How It Works

### Cluster Creation Flow
1. **Frontend**: User fills out cluster creation form
2. **MCP Server**: Receives request and validates input
3. **MongoDB Atlas**: MCP server calls Atlas API to create cluster
4. **Progress Tracking**: MCP server monitors cluster creation progress
5. **Completion**: Frontend shows success and enables data operations

### Data Operations
- **Populate Data**: MCP server adds sample data to the cluster
- **View Data**: MCP server retrieves and displays cluster data

## 📡 API Endpoints

### MCP Server Endpoints
- `POST /create-cluster` - Create a new MongoDB cluster
- `GET /api/cluster-status?id=<id>` - Get cluster creation status
- `POST /api/populate-data` - Populate sample data
- `POST /api/view-data` - View cluster data
- `GET /health` - Server health check

### Frontend → MCP Server Communication
The frontend communicates directly with the MCP server on port 3001, bypassing the backend server entirely for cluster operations.

## 🧪 Testing

Test the MCP server endpoints:
```bash
node test-mcp-server.js
```

This will verify that all endpoints are working correctly.

## 🐛 Troubleshooting

### MCP Server Offline
- Check if port 3001 is available
- Run `./start-mcp-server.sh` to restart
- Verify the server is running: `curl http://localhost:3001/health`

### Cluster Creation Fails
- Check MongoDB Atlas credentials in `.env`
- Verify network access to MongoDB Atlas
- Check MCP server console for error messages

### Frontend Can't Connect
- Ensure MCP server is running on port 3001
- Check browser console for CORS errors
- Verify the MCP server URL in the frontend code

## 🔒 Security Notes

- Never commit `.env` files with real credentials
- Use environment variables for all sensitive information
- The MCP server runs locally and should not be exposed to the internet

## 📁 Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # React components
│   │   └── ...
├── mcp-server.cjs         # MCP server (Express.js)
├── start-mcp-server.sh    # MCP server startup script
├── env-template.txt       # Environment variables template
├── test-mcp-server.js     # MCP server test script
└── ...
```

## 🚀 Deployment

For production deployment:
1. Set up proper environment variables
2. Use a process manager like PM2 for the MCP server
3. Configure proper CORS settings
4. Set up monitoring and logging
5. Use HTTPS for secure communication