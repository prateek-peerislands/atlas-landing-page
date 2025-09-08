// Frontend MCP Client that communicates with local MCP server process
interface ClusterConfig {
  clusterName: string;
  cloudProvider: string;
  region: string;
  tier: string;
}

interface MCPResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export class MongoDBMCPClient {
  public isConnected = false;
  private mcpServerPort = 3001;
  private responseHandlers: Map<string, (response: any) => void> = new Map();

  constructor() {}

  async initialize(): Promise<void> {
    console.log("🔗 [MCP-CLIENT] Initializing Frontend → MCP Server connection...");
    
    // MCP server is already running via the main server, just mark as connected
    this.isConnected = true;
    console.log("✅ [MCP-CLIENT] Frontend → MCP Server connection established");
    console.log("ℹ️ [MCP-CLIENT] MCP server is running via main server, connection marked as ready");
  }

  private async startMCPServer(): Promise<void> {
    console.log("🚀 [MCP-CLIENT] Starting MCP server...");
    
    // Send request to start MCP server
    const response = await fetch('/api/start-mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        credentials: {
          clientId: import.meta.env.VITE_MDB_MCP_API_CLIENT_ID,
          clientSecret: import.meta.env.VITE_MDB_MCP_API_CLIENT_SECRET,
          publicKey: import.meta.env.VITE_MONGODB_PUBLIC_KEY,
          privateKey: import.meta.env.VITE_MONGODB_PRIVATE_KEY
        }
      })
    });

    console.log(`📥 [MCP-CLIENT] MCP server start response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [MCP-CLIENT] Failed to start MCP server: ${response.status} ${errorText}`);
      throw new Error('Failed to start MCP server');
    }

    console.log("⏱️ [MCP-CLIENT] Waiting 3 seconds for MCP server to be ready...");
    
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));
    this.isConnected = true;
    console.log("✅ [MCP-CLIENT] MCP Server started and ready");
  }

  async createCluster(clusterName: string): Promise<MCPResponse> {
    if (!this.isConnected) {
      console.log('🔗 [MCP-CLIENT] Not connected, initializing...');
      await this.initialize();
    }

    try {
      console.log(`🚀 [MCP-CLIENT] Frontend → MCP Server: Creating cluster "${clusterName}"...`);
      console.log(`📊 [MCP-CLIENT] Request payload:`, { clusterName });
      
      // Add timeout to prevent infinite waiting
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('❌ [MCP-CLIENT] Frontend → MCP Server timeout after 10 seconds');
        controller.abort();
      }, 10000);
      
      console.log('📡 [MCP-CLIENT] Sending POST request to /api/create-cluster...');
      
      const response = await fetch('/api/create-cluster', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clusterName: clusterName
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log(`📥 [MCP-CLIENT] MCP Server response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [MCP-CLIENT] MCP Server error response:`, errorText);
        throw new Error(`MCP Server error: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ [MCP-CLIENT] MCP Server → MongoDB Atlas: Cluster creation response:', result);

      // Log exact response to trace hardcoded error source
      console.log('🔍 [MCP-CLIENT] RAW MCP Server Response:', JSON.stringify(result, null, 2));

      // Return the actual MCP server response without any transformation
      return result;

    } catch (error: any) {
      console.error('❌ [MCP-CLIENT] Frontend → MCP Server error:', error);
      console.error('❌ [MCP-CLIENT] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      // Check if this is where the IP access error is coming from
      if (error.name === 'AbortError') {
        console.log('❌ [MCP-CLIENT] Request timed out - returning timeout error');
        return {
          success: false,
          message: 'Request timed out',
          error: 'MCP server request timed out after 10 seconds'
        };
      }
      
      console.log('❌ [MCP-CLIENT] Returning error response to caller');
      return {
        success: false,
        message: 'Failed to create cluster via MCP Server',
        error: error.message || 'Unknown error occurred'
      };
    }
  }

  // List clusters functionality removed as requested

  disconnect() {
    console.log("🔌 [MCP-CLIENT] Disconnecting from MCP Server...");
    this.isConnected = false;
    console.log("✅ [MCP-CLIENT] Disconnected from MCP Server");
  }
}

// Create singleton instance
export const mcpClient = new MongoDBMCPClient();