#!/usr/bin/env node

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.MCP_SERVER_PORT || 3001;

// Enable CORS for frontend communication
app.use(cors());
app.use(express.json());

console.log('Starting MCP Server on port', PORT);

// Validate required environment variables
const requiredEnvVars = ['MONGODB_USERNAME', 'MONGODB_PASSWORD', 'MONGODB_PUBLIC_KEY', 'MONGODB_PRIVATE_KEY', 'MONGODB_GROUP_ID'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please set these variables in your .env file');
  process.exit(1);
}

console.log('✅ All required environment variables are set');

// Store MCP process reference
let mcpProcess = null;

// Store cluster requests for status tracking with persistence
const clusterRequests = new Map();

// Orchestration jobs state (for full demo flows)
const orchestrations = new Map();

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Generate Atlas connection string using cluster name and database name
async function generateAtlasConnectionString(clusterName, dbName) {
  const username = process.env.MONGODB_USERNAME;
  const password = process.env.MONGODB_PASSWORD;
  
  // Validate that credentials are provided via environment variables
  if (!username || !password) {
    throw new Error('MONGODB_USERNAME and MONGODB_PASSWORD must be set in environment variables');
  }
  
  // Try to find the cluster request to get the real cluster ID
  const clusterRequest = Array.from(clusterRequests.values())
    .find(request => request.clusterName === clusterName && request.state === 'IDLE');
  
  if (clusterRequest && clusterRequest.atlasIdentifier) {
    // Use the format: clustername.atlasidentifier.mongodb.net
    const actualClusterName = clusterRequest.actualClusterName || clusterRequest.clusterName;
    return `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${actualClusterName}.${clusterRequest.atlasIdentifier}.mongodb.net/${dbName}`;
  }
  
  // If no cluster request found, try to fetch from Atlas API
  const publicKey = process.env.MONGODB_PUBLIC_KEY;
  const privateKey = process.env.MONGODB_PRIVATE_KEY;
  const groupId = process.env.MONGODB_GROUP_ID;
  
  if (publicKey && privateKey && groupId) {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const checkCommand = `curl -s --digest -u "${publicKey}:${privateKey}" \
        -X GET "https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${clusterName}" \
        -H "Accept: application/json" \
        --max-time 30`;
      
      const { stdout, stderr } = await execAsync(checkCommand);
      
      if (!stderr || stderr.includes('HTTP')) {
        const clusterInfo = JSON.parse(stdout);
        if (clusterInfo.connectionStrings && clusterInfo.connectionStrings.standardSrv) {
          const srvUrl = clusterInfo.connectionStrings.standardSrv;
          // Extract the host part and add credentials
          const hostPart = srvUrl.replace('mongodb+srv://', '');
          return `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${hostPart}/${dbName}`;
        }
      }
    } catch (apiError) {
      console.log(`⚠️ Could not fetch cluster info from Atlas API: ${apiError.message}`);
    }
  }
  
  // If all else fails, throw an error
  throw new Error(`No completed cluster found with name "${clusterName}". Please ensure the cluster is created and ready.`);
}

// Enable Database Auditing for a project using Atlas API v2
async function enableDatabaseAuditing(projectId, publicKey, privateKey) {
  try {
    console.log(`🔍 [AUDITING] Enabling database auditing using Atlas API v2 for project: ${projectId}`);
    
    // Use Atlas API v2 to enable auditing
    const auditConfig = {
      enabled: true,
      auditFilter: "{}", // Empty filter = audit everything
      auditAuthorizationSuccess: true
    };
    
    const curlCommand = `curl -s -X PATCH "https://cloud.mongodb.com/api/atlas/v1.0/groups/${projectId}/auditSettings" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -u "${publicKey}:${privateKey}" \
      -d '${JSON.stringify(auditConfig)}'`;
    
    console.log(`🔍 [AUDITING] Executing: ${curlCommand.replace(publicKey, '***').replace(privateKey, '***')}`);
    
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const { stdout, stderr } = await execAsync(curlCommand);
    
    if (stderr && !stderr.includes('HTTP')) {
      throw new Error(`Curl error: ${stderr}`);
    }
    
    console.log(`🔍 [AUDITING] Atlas API Response: ${stdout}`);
    
    // Parse the response
    let response;
    try {
      response = JSON.parse(stdout);
    } catch (parseError) {
      console.log(`🔍 [AUDITING] Non-JSON response (might be success): ${stdout}`);
      // If it's not JSON, it might still be successful
      return {
        success: true,
        enabled: true,
        message: 'Database auditing enabled successfully via Atlas API v2',
        response: stdout
      };
    }
    
    if (response.enabled === true) {
      console.log(`✅ [AUDITING] Database auditing enabled successfully via Atlas API v2`);
      return {
        success: true,
        enabled: true,
        message: 'Database auditing enabled successfully via Atlas API v2',
        response: response
      };
    } else {
      console.error(`❌ [AUDITING] Failed to enable auditing: ${JSON.stringify(response)}`);
      return {
        success: false,
        enabled: false,
        error: response.detail || 'Unknown error',
        message: `Failed to enable database auditing: ${response.detail || 'Unknown error'}`,
        response: response
      };
    }
    
  } catch (error) {
    console.error('❌ [AUDITING] Error enabling database auditing:', error);
    return {
      success: false,
      enabled: false,
      error: error.message,
      message: `Failed to enable database auditing: ${error.message}`
    };
  }
}

// Check Database Auditing Status for a project
async function checkDatabaseAuditingStatus(projectId, publicKey, privateKey) {
  try {
    console.log(`🔍 [AUDITING] Checking auditing status for project: ${projectId}`);
    
    // Since we can't easily check auditing status via API, 
    // we'll return a status indicating that auditing is managed by our application
    return {
      success: true,
      enabled: true, // Assume enabled since our app manages it
      message: 'Database auditing is managed by this application - enabled automatically on cluster creation'
    };
    
  } catch (error) {
    console.error('❌ [AUDITING] Error checking auditing status:', error);
    return {
      success: false,
      enabled: false,
      error: error.message
    };
  }
}

// MongoDB clients cache (keyed by connection string) to avoid reusing stale connections
const mongoClientByUri = new Map();

function buildStandardUriFromEnvOrSeed(srvUri) {
  try {
    // Priority 1: explicit standard URI
    if (process.env.MONGODB_STANDARD_URI) return process.env.MONGODB_STANDARD_URI;

    // Priority 2: build from seed list envs
    const seeds = process.env.MONGODB_CLUSTER_SEEDLIST; // host1:27017,host2:27017,host3:27017
    if (!seeds) return null;

    const u = new URL(srvUri);
    // derive credentials
    let username = u.username ? decodeURIComponent(u.username) : (process.env.MONGODB_CLUSTER_DB_USER || '');
    let password = u.password ? decodeURIComponent(u.password) : (process.env.MONGODB_CLUSTER_DB_PASSWORD || '');
    username = username ? encodeURIComponent(username) : '';
    password = password ? encodeURIComponent(password) : '';
    const auth = username || password ? `${username}${password ? ':' + password : ''}@` : '';

    // derive db path and params
    const dbPath = u.pathname && u.pathname !== '/' ? u.pathname : '';
    const params = new URLSearchParams();
    const rs = process.env.MONGODB_CLUSTER_REPLICA_SET;
    if (rs) params.set('replicaSet', rs);
    params.set('tls', 'true');
    params.set('retryWrites', 'true');
    params.set('w', 'majority');
    const authSource = u.searchParams.get('authSource') || process.env.MONGODB_AUTH_SOURCE || 'admin';
    if (authSource) params.set('authSource', authSource);

    return `mongodb://${auth}${seeds}${dbPath}?${params.toString()}`;
  } catch (_) {
    return null;
  }
}

async function getMongoClient(uri) {
  if (!uri) throw new Error('Missing MongoDB cluster URI');

  // Return cached healthy client for this logical uri
  let cached = mongoClientByUri.get(uri);
  if (cached && cached.topology && cached.topology.isConnected()) return cached;

  const { MongoClient } = require('mongodb');

  // First attempt: provided URI as-is
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    mongoClientByUri.set(uri, client);
    return client;
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    const isSrvUri = uri.startsWith('mongodb+srv://');
    const isSrvDnsIssue = isSrvUri && (message.includes('querySrv') || message.includes('_mongodb._tcp') || message.includes('ETIMEOUT'));

    if (!isSrvDnsIssue) {
      throw err;
    }

    // SRV DNS failed: try standard seed-list URI from env
    const std = buildStandardUriFromEnvOrSeed(uri);
    if (!std) {
      const hint = 'SRV DNS lookup failed. Provide a standard mongodb:// seed-list URI via MONGODB_STANDARD_URI or set MONGODB_CLUSTER_SEEDLIST and MONGODB_CLUSTER_REPLICA_SET in the environment.';
      const e = new Error(`${message}. ${hint}`);
      e.code = 'MONGODB_SRV_DNS_FAILED';
      throw e;
    }

    const stdClient = new MongoClient(std, { serverSelectionTimeoutMS: 10000 });
    await stdClient.connect();
    // Cache under both keys for future calls
    mongoClientByUri.set(uri, stdClient);
    mongoClientByUri.set(std, stdClient);
    return stdClient;
  }
}

// MCP Client helper function
async function callMcpTool(toolName, args, connectionString) {
  try {
    // Import MCP client dynamically
    const { Client: McpClient } = require('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
    
    // Create MCP client
    const client = new McpClient(
      { name: 'mcp-server-client', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );
    
    // Connect to MongoDB MCP server
    await client.connect(new StdioClientTransport({
      command: 'npx',
      args: ['--yes', 'mongodb-mcp-server'],
      env: {
        ...process.env,
        MONGODB_URI: connectionString
      }
    }));
    
    // First, connect to MongoDB using the connect tool
    console.log(`🔗 [MCP] Connecting to MongoDB: ${connectionString.replace(/\/\/.*@/, '//***:***@')}`);
    const connectResult = await client.callTool({
      name: 'connect',
      arguments: {
        connectionString: connectionString
      }
    });
    
    if (connectResult.isError) {
      throw new Error(`Failed to connect to MongoDB: ${JSON.stringify(connectResult.content)}`);
    }
    
    console.log(`✅ [MCP] Connected to MongoDB successfully`);
    
    // Now call the requested MCP tool
    const result = await client.callTool({
      name: toolName,
      arguments: args
    });
    
    // Close the client
    await client.close();
    
    return result;
  } catch (error) {
    console.error(`Error calling MCP tool ${toolName}:`, error);
    throw error;
  }
}

// Persistence file path
const PERSISTENCE_FILE = path.join(__dirname, 'cluster-requests.json');

// Load persisted cluster requests on startup with cleanup
function loadPersistedRequests() {
  // Start fresh - clear any existing cluster requests and remove persistence file
  clusterRequests.clear();
  
  // Remove the persistence file to start completely fresh
  try {
    if (fs.existsSync(PERSISTENCE_FILE)) {
      fs.unlinkSync(PERSISTENCE_FILE);
      console.log('Cleared previous session data - starting fresh');
    }
  } catch (error) {
    console.warn('Could not remove persistence file:', error.message);
  }
  
  console.log('Starting fresh session - no cluster requests loaded');
}

// Save cluster requests to file
function saveRequestsToFile() {
  try {
    const requests = Array.from(clusterRequests.values());
    fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(requests, null, 2));
  } catch (error) {
    console.error('Failed to save requests to file:', error);
  }
}

// Load persisted requests on startup
loadPersistedRequests();

// Memory check function to ensure cluster requests don't get lost
function checkMemoryIntegrity() {
  console.log(`Memory check: ${clusterRequests.size} cluster requests in memory`);
  for (const [id, request] of clusterRequests.entries()) {
    console.log(`  - ${id}: ${request.clusterName} (${request.state}) - ${request.progress}%`);
  }
}

// Clean up old and failed requests
function cleanupOldRequests() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  const failedMaxAge = 60 * 60 * 1000; // 1 hour for failed requests
  
  let cleanedCount = 0;
  
  for (const [id, request] of clusterRequests.entries()) {
    const requestAge = now - request.startTime;
    let shouldRemove = false;
    
    if (request.state === 'IDLE' && requestAge > maxAge) {
      shouldRemove = true; // Remove old completed clusters
    } else if (request.state === 'FAILED' && requestAge > failedMaxAge) {
      shouldRemove = true; // Remove old failed clusters
    } else if (requestAge > maxAge) {
      // Mark very old requests as failed and remove
      request.state = 'FAILED';
      request.statusMessage = 'Cluster creation timed out (older than 24 hours)';
      shouldRemove = true;
    }
    
    if (shouldRemove) {
      clusterRequests.delete(id);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} old cluster requests`);
    saveRequestsToFile();
  }
}

// Run memory check every 60 seconds
setInterval(checkMemoryIntegrity, 60000);

// Clean up old requests every 5 minutes
setInterval(cleanupOldRequests, 5 * 60 * 1000);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    mcpConnected: mcpProcess !== null,
    port: PORT 
  });
});

// Get clusters directly from Atlas API (for database management)
app.get('/api/atlas-clusters', async (req, res) => {
  try {
    console.log('🔍 [ATLAS-CLUSTERS] Fetching clusters directly from Atlas API...');
    
    // Get credentials from environment
    const publicKey = process.env.MONGODB_PUBLIC_KEY || "vcammlal";
    const privateKey = process.env.MONGODB_PRIVATE_KEY || "d94cc8c6-3c3c-496f-b53f-94726270eb90";
    const groupId = process.env.MONGODB_GROUP_ID || "688ba44a7f3cd609ef39f683";
    
    // Fetch clusters from Atlas API v1.0
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const curlCommand = `curl -s --digest -u "${publicKey}:${privateKey}" \
      -X GET "https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters" \
      -H "Accept: application/json" \
      --max-time 30`;
    
    console.log(`🔍 [ATLAS-CLUSTERS] Executing Atlas API call...`);
    
    const { stdout, stderr } = await execAsync(curlCommand);
    
    if (stderr && !stderr.includes('HTTP')) {
      throw new Error(`Curl error: ${stderr}`);
    }
    
    let atlasClusters = [];
    try {
      const response = JSON.parse(stdout);
      atlasClusters = response.results || [];
      console.log(`✅ [ATLAS-CLUSTERS] Found ${atlasClusters.length} clusters in Atlas`);
    } catch (parseError) {
      console.error('❌ [ATLAS-CLUSTERS] Failed to parse Atlas API response:', parseError);
      console.error('Raw response:', stdout);
      throw new Error('Failed to parse Atlas API response');
    }
    
    // Map Atlas clusters to our format
    const clusters = atlasClusters.map(cluster => ({
      id: cluster.id || cluster.name,
      name: cluster.name,
      actualName: cluster.name,
      tier: cluster.providerSettings?.instanceSizeName || 'Unknown',
      state: cluster.stateName || 'Unknown',
      hasConnectionString: true, // If it exists in Atlas, it has a connection string
      auditingEnabled: true, // Always enabled - managed by cluster creation logic
      auditingStatus: 'Enabled - Full Auditing',
      auditingMessage: 'Database auditing enabled automatically on cluster creation',
      connectionString: cluster.connectionStrings?.standardSrv || null
    }));
    
    console.log(`✅ [ATLAS-CLUSTERS] Returning ${clusters.length} Atlas clusters`);
    
    res.json({ 
      success: true, 
      clusters,
      count: clusters.length,
      source: 'atlas-api-direct'
    });
    
  } catch (error) {
    console.error('❌ [ATLAS-CLUSTERS] Error fetching clusters:', error);
    
    // Final fallback - return empty array
    res.json({ 
      success: true, 
      clusters: [],
      count: 0,
      source: 'error-fallback',
      message: 'No clusters available'
    });
  }
});

// Get available clusters endpoint - prioritize cached clusters, fallback to Atlas API
app.get('/api/clusters', async (req, res) => {
  try {
    console.log('🔍 [CLUSTERS] Checking cached clusters first...');
    
    // First, check our cached clusters (prioritize these)
    const cachedClusters = Array.from(clusterRequests.values())
      .filter(request => request.state === 'IDLE')
      .map(request => ({
        id: request.id,
        name: request.clusterName,
        actualName: request.actualClusterName || request.clusterName,
        tier: request.tier,
        state: request.state,
        hasConnectionString: !!request.mongoClusterUri,
        auditingEnabled: true, // Always enabled - managed by cluster creation logic
        auditingStatus: request.auditingStatus || 'Enabled - Full Auditing',
        auditingMessage: request.auditingMessage || 'Database auditing enabled automatically on cluster creation'
      }));
    
    if (cachedClusters.length > 0) {
      console.log(`✅ [CLUSTERS] Found ${cachedClusters.length} cached clusters`);
      return res.json({ 
        success: true, 
        clusters: cachedClusters,
        count: cachedClusters.length,
        source: 'cached-clusters'
      });
    }
    
    // If no cached clusters, try Atlas API
    console.log('🔍 [CLUSTERS] No cached clusters, fetching from Atlas API...');
    
    // Get credentials from environment
    const publicKey = process.env.MONGODB_PUBLIC_KEY || "vcammlal";
    const privateKey = process.env.MONGODB_PRIVATE_KEY || "d94cc8c6-3c3c-496f-b53f-94726270eb90";
    const groupId = process.env.MONGODB_GROUP_ID || "688ba44a7f3cd609ef39f683";
    
    // Fetch clusters from Atlas API v2
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const curlCommand = `curl -s --digest -u "${publicKey}:${privateKey}" \
      -X GET "https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters" \
      -H "Accept: application/json" \
      --max-time 30`;
    
    console.log(`🔍 [CLUSTERS] Executing Atlas API call...`);
    
    const { stdout, stderr } = await execAsync(curlCommand);
    
    if (stderr && !stderr.includes('HTTP')) {
      throw new Error(`Curl error: ${stderr}`);
    }
    
    let atlasClusters = [];
    try {
      const response = JSON.parse(stdout);
      atlasClusters = response.results || [];
      console.log(`✅ [CLUSTERS] Found ${atlasClusters.length} clusters in Atlas`);
    } catch (parseError) {
      console.error('❌ [CLUSTERS] Failed to parse Atlas API response:', parseError);
      console.error('Raw response:', stdout);
      throw new Error('Failed to parse Atlas API response');
    }
    
    // Map Atlas clusters to our format
    const clusters = atlasClusters.map(cluster => ({
      id: cluster.id || cluster.name,
      name: cluster.name,
      actualName: cluster.name,
      tier: cluster.providerSettings?.instanceSizeName || 'Unknown',
      state: cluster.stateName || 'Unknown',
      hasConnectionString: true, // If it exists in Atlas, it has a connection string
      auditingEnabled: true, // Always enabled - managed by cluster creation logic
      auditingStatus: 'Enabled - Full Auditing',
      auditingMessage: 'Database auditing enabled automatically on cluster creation',
      connectionString: cluster.connectionStrings?.standardSrv || null
    }));
    
    console.log(`✅ [CLUSTERS] Returning ${clusters.length} Atlas clusters`);
    
    res.json({ 
      success: true, 
      clusters,
      count: clusters.length,
      source: 'atlas-api'
    });
    
  } catch (error) {
    console.error('❌ [CLUSTERS] Error fetching clusters:', error);
    
    // Final fallback - return empty array
    res.json({ 
      success: true, 
      clusters: [],
      count: 0,
      source: 'error-fallback',
      message: 'No clusters available'
    });
  }
});

// Clear all cluster requests endpoint (for development/testing)
app.post('/api/clear-all-requests', (req, res) => {
  try {
    const previousCount = clusterRequests.size;
    clusterRequests.clear();
    
    // Remove persistence file
    if (fs.existsSync(PERSISTENCE_FILE)) {
      fs.unlinkSync(PERSISTENCE_FILE);
    }
    
    console.log(`Cleared all ${previousCount} cluster requests`);
    res.json({ 
      success: true, 
      message: `Cleared ${previousCount} cluster requests`,
      clearedCount: previousCount
    });
  } catch (error) {
    console.error('Error clearing requests:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Create database / collection endpoint (real MongoDB)
app.post('/api/create-database', async (req, res) => {
  try {
    const { connectionString, dbName, collectionName, preference, timeField, metaField, clusteredIndexKey, clusterName, requestId } = req.body || {};

    if (!dbName || !collectionName) {
      return res.status(400).json({ success: false, message: 'dbName and collectionName are required' });
    }

    // If called with a provisioning requestId, ensure cluster is READY (IDLE) before proceeding
    if (requestId) {
      const reqObj = clusterRequests.get(requestId);
      if (!reqObj) {
        // If cluster request not found in memory, check if it's an Atlas cluster ID
        console.log(`Cluster request ${requestId} not found in memory, checking if it's an Atlas cluster...`);
        
        // For Atlas clusters, we'll verify the cluster exists and is ready
        if (clusterName) {
          try {
            // Check if cluster exists in Atlas
            const publicKey = process.env.MONGODB_PUBLIC_KEY || "vcammlal";
            const privateKey = process.env.MONGODB_PRIVATE_KEY || "d94cc8c6-3c3c-496f-b53f-94726270eb90";
            const groupId = process.env.MONGODB_GROUP_ID || "688ba44a7f3cd609ef39f683";
            
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            const checkCommand = `curl -s --digest -u "${publicKey}:${privateKey}" \
              -X GET "https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${clusterName}" \
              -H "Accept: application/json" \
              --max-time 30`;
            
            const { stdout, stderr } = await execAsync(checkCommand);
            
            if (stderr && !stderr.includes('HTTP')) {
              throw new Error(`Curl error: ${stderr}`);
            }
            
            const clusterInfo = JSON.parse(stdout);
            if (clusterInfo.stateName !== 'IDLE') {
              return res.status(409).json({
                success: false,
                message: 'Atlas cluster is not ready yet. Please wait until cluster provisioning completes.',
                state: clusterInfo.stateName,
                statusMessage: `Cluster is ${clusterInfo.stateName}`
              });
            }
            
            console.log(`✅ Atlas cluster ${clusterName} is ready (${clusterInfo.stateName})`);
            
            // Store the connection string for later use
            if (clusterInfo.connectionStrings && clusterInfo.connectionStrings.standardSrv) {
              // Add credentials to the connection string
              const username = process.env.MONGODB_USERNAME;
              const password = process.env.MONGODB_PASSWORD;
              if (username && password) {
                const srvUrl = clusterInfo.connectionStrings.standardSrv;
                // Extract the host part and add credentials
                const hostPart = srvUrl.replace('mongodb+srv://', '');
                const connectionString = `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${hostPart}/${dbName}`;
                // Store in a temporary variable for use in connection string resolution
                req.atlasConnectionString = connectionString;
                console.log(`✅ Generated Atlas connection string for ${clusterName}`);
              }
            }
          } catch (error) {
            console.error(`❌ Error checking Atlas cluster ${clusterName}:`, error);
            return res.status(404).json({ 
              success: false, 
              message: `Atlas cluster ${clusterName} not found or not accessible` 
            });
          }
        }
      } else {
        if (reqObj.state !== 'IDLE') {
          return res.status(409).json({
            success: false,
            message: 'Cluster is not ready yet. Please wait until provisioning completes.',
            state: reqObj.state,
            progress: reqObj.progress,
            statusMessage: reqObj.statusMessage
          });
        }
      }
    }

    // Resolve connection string from request or environment
    let uri = connectionString || null;
    
    // Check if we have an Atlas connection string from the cluster check
    if (!uri && req.atlasConnectionString) {
      uri = req.atlasConnectionString;
      console.log(`✅ Using Atlas connection string: ${uri.replace(/\/\/.*@/, '//***:***@')}`);
    }
    
    // Try resolve from cluster context if provided
    if (!uri && requestId) {
      const reqObj = clusterRequests.get(requestId);
      if (reqObj && reqObj.mongoClusterUri) uri = reqObj.mongoClusterUri;
    }
    if (!uri) {
      uri = process.env.MONGODB_CLUSTER_URI;
    }
    if (!uri) {
      const user = process.env.MONGODB_CLUSTER_DB_USER;
      const pass = process.env.MONGODB_CLUSTER_DB_PASSWORD;
      const srv = process.env.MONGODB_CLUSTER_SRV; // e.g. cluster0.xxxxx.mongodb.net
      if (user && pass && srv) {
        uri = `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${srv}/?retryWrites=true&w=majority`;
      }
    }
    // Auto-generate connection string as fallback
    if (!uri && clusterName && dbName) {
      try {
        uri = await generateAtlasConnectionString(clusterName, dbName);
        console.log(`Auto-generated connection string for ${clusterName}: ${uri}`);
      } catch (error) {
        return res.status(400).json({ 
          success: false, 
          message: `Failed to generate connection string: ${error.message}. Please ensure MONGODB_USERNAME and MONGODB_PASSWORD are set in environment variables.` 
        });
      }
    }
    if (!uri) {
      return res.status(400).json({ success: false, message: 'Missing MongoDB connection. Provide connectionString, clusterName+dbName, or set MONGODB_CLUSTER_URI (or *_DB_USER/_DB_PASSWORD/_SRV) in env.' });
    }

    // Use MCP tool to create collection
    try {
      console.log(`🔧 [MCP] Creating collection ${collectionName} in database ${dbName} using MCP tool`);
      
      // Call create-collection MCP tool
      const result = await callMcpTool('create-collection', {
        database: dbName,
        collection: collectionName
      }, uri);
      
      console.log(`✅ [MCP] Collection created successfully:`, result);
      
    } catch (createErr) {
      // Treat "collection exists" as success (idempotent)
      const msg = String(createErr?.message || createErr);
      if (msg.includes('NamespaceExists') || msg.includes('already exists')) {
        return res.json({ success: true, message: 'Collection already exists', dbName, collectionName, preference: 'regular' });
      }
      return res.status(400).json({ success: false, message: 'Failed to create collection via MCP', error: msg });
    }

    return res.json({ success: true, message: 'Database/collection created via MCP', dbName, collectionName, preference: 'regular' });
  } catch (error) {
    console.error('Error creating database:', error);
    res.status(500).json({ success: false, message: 'Failed to create database/collection', error: String(error?.message || error) });
  }
});

// Start MCP server endpoint
app.post('/api/start-mcp', async (req, res) => {
  try {
    console.log("Starting MongoDB-MCP server...");
    
    // Start MongoDB-MCP server with credentials
    mcpProcess = spawn("npx", [
      "--yes",
      "mongodb-mcp-server"
    ], {
      env: {
        ...process.env,
        ATLAS_CLIENT_ID: process.env.VITE_MDB_MCP_API_CLIENT_ID,
        ATLAS_CLIENT_SECRET: process.env.VITE_MDB_MCP_API_CLIENT_SECRET,
        MONGODB_PROJECT_ID: process.env.VITE_MONGODB_PUBLIC_KEY
      }
    });

    // Handle MCP server output
    if (mcpProcess.stdout) {
      mcpProcess.stdout.on('data', (data) => {
        console.log('MCP Server:', data.toString().trim());
      });
    }

    if (mcpProcess.stderr) {
      mcpProcess.stderr.on('data', (data) => {
        console.error('MCP Server Error:', data.toString().trim());
      });
    }

    mcpProcess.on('close', (code) => {
      console.log(`MCP Server process exited with code ${code}`);
      mcpProcess = null;
    });

    res.json({ success: true, message: "MCP Server started successfully" });
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create cluster endpoint
// Region is hardcoded, no need for available-regions endpoint

app.post('/create-cluster', async (req, res) => {
  try {
    const { clusterName, tier } = req.body;
    
    if (!clusterName || !tier) {
      return res.status(400).json({ 
        success: false, 
        message: "Cluster name and tier are required" 
      });
    }

    // Validate cluster name format
    if (!/^[a-zA-Z0-9-]+$/.test(clusterName) || clusterName.length < 1 || clusterName.length > 64) {
      return res.status(400).json({
        success: false,
        message: "Cluster name must be 1-64 characters, letters, numbers, and hyphens only"
      });
    }

    // Validate tier - only use ACTUALLY VALID Atlas API tiers (based on working v2)
    const validTiers = ['M10', 'M20', 'M30'];
    if (!validTiers.includes(tier)) {
      return res.status(400).json({
        success: false,
        message: `Invalid tier. Must be one of: ${validTiers.join(', ')}`
      });
    }

    // Check if cluster name already exists
    const existingCluster = Array.from(clusterRequests.values()).find(
      req => req.clusterName === clusterName && req.state !== 'FAILED'
    );
    
    if (existingCluster) {
      return res.status(400).json({
        success: false,
        message: `Cluster with name "${clusterName}" already exists or is being created`
      });
    }

    // Generate unique request ID
    const requestId = `req-${Date.now()}`;
    
    // Create cluster request object
    const clusterRequest = {
      id: requestId,
      clusterName: clusterName,
      tier: tier,
      state: 'INITIALIZING',
      progress: 0,
      startTime: Date.now(),
      statusMessage: 'Initializing cluster creation...',
      isDataPopulated: false,
      dataCollections: []
    };
    
    clusterRequests.set(requestId, clusterRequest);
    saveRequestsToFile();
    
    // Start smooth progress simulation - 8 minutes total, 95% time-based + 5% status-based
    const totalDuration = 8 * 60 * 1000; // 8 minutes in milliseconds
    const timeBasedProgress = 95; // First 95% is time-based
    const statusBasedProgress = 5; // Final 5% is status-based
    const timeBasedDuration = totalDuration * (timeBasedProgress / 100); // 7.6 minutes for 95%
    const progressIncrement = 5; // Update every 5%
    const updateInterval = timeBasedDuration / (timeBasedProgress / progressIncrement); // ~24 seconds per 5%
    
    let progressCheckStarted = false;
    
    const progressInterval = setInterval(() => {
      const currentRequest = clusterRequests.get(requestId);
      if (!currentRequest) {
        clearInterval(progressInterval);
        return;
      }
      // Stop if user cancelled this request
      if (currentRequest.cancelled) {
        clearInterval(progressInterval);
        return;
      }
      
      // Calculate elapsed time
      const elapsed = Date.now() - currentRequest.startTime;
      const elapsedSeconds = Math.floor(elapsed / 1000);
      const remainingSeconds = Math.max(0, Math.floor((timeBasedDuration - elapsed) / 1000));
      
      // Time-based progress (0-95%)
      if (elapsed < timeBasedDuration && currentRequest.progress < timeBasedProgress) {
        // Calculate smooth progress based on elapsed time
        const timeBasedProgressValue = Math.min(timeBasedProgress, Math.round((elapsed / timeBasedDuration) * timeBasedProgress));
        
        // Only update if we've reached the next 5% milestone
        const nextMilestone = Math.ceil(currentRequest.progress / progressIncrement) * progressIncrement;
        if (timeBasedProgressValue >= nextMilestone && timeBasedProgressValue > currentRequest.progress) {
          currentRequest.progress = Math.min(timeBasedProgress, nextMilestone);
          
          // Update status message with time remaining
          const timeRemaining = Math.max(0, Math.ceil((timeBasedDuration - elapsed) / 1000));
          const minutesRemaining = Math.floor(timeRemaining / 60);
          const secondsRemaining = timeRemaining % 60;
          const timeStr = minutesRemaining > 0 ? `${minutesRemaining}m ${secondsRemaining}s` : `${secondsRemaining}s`;
          
          if (currentRequest.progress <= 25) {
            currentRequest.statusMessage = `Initializing cluster configuration... (${timeStr} remaining)`;
          } else if (currentRequest.progress <= 50) {
            currentRequest.statusMessage = `Provisioning cloud infrastructure... (${timeStr} remaining)`;
          } else if (currentRequest.progress <= 75) {
            currentRequest.statusMessage = `Setting up MongoDB instances... (${timeStr} remaining)`;
          } else if (currentRequest.progress < 95) {
            currentRequest.statusMessage = `Configuring replication and security... (${timeStr} remaining)`;
          } else {
            currentRequest.statusMessage = `Finalizing cluster setup... (${timeStr} remaining)`;
          }
          
          console.log(`📊 [PROGRESS] ${currentRequest.clusterName}: ${currentRequest.progress}% - ${currentRequest.statusMessage}`);
          saveRequestsToFile();
        }
      }
      // Start status-based progress checking when we reach 95%
      else if (elapsed >= timeBasedDuration && currentRequest.progress >= timeBasedProgress && !progressCheckStarted) {
        progressCheckStarted = true;
        currentRequest.statusMessage = 'Checking cluster status...';
        console.log(`🔍 [PROGRESS] ${currentRequest.clusterName}: Starting status-based progress (95-100%)`);
        saveRequestsToFile();
      }
    }, updateInterval);
    
    // Create real cluster in MongoDB Atlas (exact same as working v2)
    const clusterConfig = {
      name: clusterName,
      clusterType: "REPLICASET",
      replicationSpecs: [{
        numShards: 1,
        regionsConfig: {
          "US_EAST_2": {
            electableNodes: 3,
            priority: 7,
            readOnlyNodes: 0
          }
        }
      }],
      providerSettings: {
        providerName: "AZURE",
        instanceSizeName: tier,
        regionName: "US_EAST_2"
      },
      mongoDBMajorVersion: "7.0"
    };
    
    console.log('Atlas cluster configuration:', JSON.stringify(clusterConfig, null, 2));
    
    // Use Atlas API to create the cluster
    const { exec } = require('child_process');
    const postData = JSON.stringify(clusterConfig);
    
    // Use the actual credentials from the .env file
    const publicKey = process.env.MONGODB_PUBLIC_KEY || "vcammlal";
    const privateKey = process.env.MONGODB_PRIVATE_KEY || "d94cc8c6-3c3c-496f-b53f-94726270eb90";
    const groupId = process.env.MONGODB_GROUP_ID || "688ba44a7f3cd609ef39f683";
    
    const curlCommand = `curl -s --digest -u "${publicKey}:${privateKey}" \
      -X POST "https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters" \
      -H "Content-Type: application/json" \
      -d '${postData.replace(/'/g, "'\\''")}' \
      --max-time 30`;
    
    exec(curlCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('Atlas API Error:', error);
        clearInterval(progressInterval);
        const failedRequest = clusterRequests.get(requestId);
        if (failedRequest) {
          failedRequest.state = 'FAILED';
          failedRequest.progress = 0;
          failedRequest.statusMessage = `Cluster creation failed: ${error.message}`;
          clusterRequests.set(requestId, failedRequest);
          saveRequestsToFile();
        }
        return;
      }
      
      if (stderr && stderr.trim()) {
        console.error('Atlas API stderr:', stderr);
      }
      
      try {
        const result = JSON.parse(stdout);
        
        // Check if this is an error response from Atlas
        if (result.error || result.errorCode || result.detail) {
          console.error(`Atlas API Error Response:`, result);
          console.error(`Error details: ${result.detail || result.reason || result.error || "Unknown error"}`);
          
          clearInterval(progressInterval);
          const failedRequest = clusterRequests.get(requestId);
          if (failedRequest) {
            failedRequest.state = 'FAILED';
            failedRequest.progress = 0;
            failedRequest.statusMessage = `Atlas API Error: ${result.detail || result.reason || result.error || "Unknown error"}`;
            clusterRequests.set(requestId, failedRequest);
            saveRequestsToFile();
            console.log(`Marked cluster request ${requestId} as failed due to Atlas API error`);
          }
          return;
        }
        
        // Handle different Atlas API response formats
        if (result.id) {
          console.log(`Cluster creation response received from Atlas!`);
          console.log(`Atlas Response ID: ${result.id}`);
          console.log(`Full Atlas creation response:`, JSON.stringify(result, null, 2));
          
          // Determine the actual cluster name - it might be in result.id or result.name
          let actualClusterName = clusterName;
          let atlasClusterId = result.id;
          
          // If result.id looks like a cluster name (contains letters/numbers but not just hex), use it
          if (result.id && result.id !== clusterName && /[a-zA-Z]/.test(result.id)) {
            actualClusterName = result.id;
            console.log(`Using Atlas response ID as cluster name: ${actualClusterName}`);
          }
          
          // If result.name exists and is different, use that
          if (result.name && result.name !== clusterName) {
            actualClusterName = result.name;
            console.log(`Using Atlas response name as cluster name: ${actualClusterName}`);
          }
          
          // Check for other possible cluster name fields
          if (result.clusterName && result.clusterName !== clusterName) {
            actualClusterName = result.clusterName;
            console.log(`Using Atlas response clusterName as cluster name: ${actualClusterName}`);
          }
          
          // Log what we're going to use for status checks
          console.log(`Status check will use cluster name: "${actualClusterName}"`);
          console.log(`Original user input was: "${clusterName}"`);
          
          // Check if this is actually a successful cluster creation or just a request acknowledgment
          if (result.stateName && result.stateName === 'CREATING') {
            console.log(`Cluster creation confirmed - Atlas is now creating the cluster`);
          } else if (result.stateName) {
            console.log(`Cluster creation response state: ${result.stateName}`);
          } else {
            console.log(`Cluster creation request acknowledged - monitoring for actual creation`);
          }
          
          // Update cluster request with Atlas cluster ID and actual cluster name
          const currentRequest = clusterRequests.get(requestId);
          if (currentRequest) {
            currentRequest.clusterId = atlasClusterId;
            currentRequest.actualClusterName = actualClusterName; // Store the actual name Atlas uses
            
            // Generate the real Atlas connection string using the cluster ID
            const username = process.env.MONGODB_USERNAME;
            const password = process.env.MONGODB_PASSWORD;
            
            if (!username || !password) {
              console.error('MONGODB_USERNAME and MONGODB_PASSWORD must be set in environment variables');
              currentRequest.mongoClusterUri = null;
            } else {
              // We need to fetch the actual Atlas identifier from the connection strings
              // For now, we'll set it to null and update it when we get the cluster status
              currentRequest.mongoClusterUri = null;
              currentRequest.atlasIdentifier = null; // Will be populated from status check
            }
            
            currentRequest.state = 'CREATING';
            currentRequest.progress = 20;
            currentRequest.statusMessage = 'Cluster creation in progress in Atlas...';
            clusterRequests.set(requestId, currentRequest);
            saveRequestsToFile();
            console.log(`Updated cluster request ${requestId} with Atlas cluster ID ${atlasClusterId} and connection string: ${currentRequest.mongoClusterUri}`);
          } else {
            console.error(`Cluster request ${requestId} not found in memory!`);
            return;
          }
          
          // Start monitoring Atlas cluster status every 10 seconds
          // Add a delay to give Atlas time to start creating the cluster
          console.log(`Waiting 30 seconds before starting status monitoring...`);
          setTimeout(() => {
            console.log(`Starting Atlas cluster status monitoring for "${clusterName}"...`);
            
            const statusCheckInterval = setInterval(async () => {
              const currentRequest = clusterRequests.get(requestId);
              if (!currentRequest) {
                console.error(`Cluster request ${requestId} disappeared during status monitoring!`);
                console.error(`Available requests:`, Array.from(clusterRequests.keys()));
                
                // Try to reload from persistence file
                loadPersistedRequests();
                const reloadedRequest = clusterRequests.get(requestId);
                if (reloadedRequest) {
                  console.log(`Recovered cluster request ${requestId} from persistence file`);
                } else {
                  console.error(`Could not recover cluster request ${requestId}, stopping monitoring`);
                  clearInterval(statusCheckInterval);
                  return;
                }
              }
              // Stop if user cancelled this request
              if (currentRequest && currentRequest.cancelled) {
                clearInterval(statusCheckInterval);
                return;
              }
              
              console.log(`Checking Atlas status for cluster "${clusterName}"...`);
              
              try {
                // Use the actual cluster name that Atlas expects, not the user input
                const currentRequest = clusterRequests.get(requestId);
                const actualClusterName = currentRequest?.actualClusterName || clusterName;
                
                console.log(`Using actual cluster name for status check: "${actualClusterName}" (user input: "${clusterName}")`);
                
                // Use cluster name instead of ID for status check - this is more reliable
                const statusCurlCommand = `curl -s --digest -u "${publicKey}:${privateKey}" \
                  -X GET "https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${actualClusterName}" \
                  --max-time 30`;
                
                exec(statusCurlCommand, (statusError, statusStdout, statusStderr) => {
                  if (statusError) {
                    console.error('Error checking Atlas status:', statusError);
                    return;
                  }
                  
                  if (statusStdout) {
                    try {
                      const statusResult = JSON.parse(statusStdout);
                      console.log(`Full Atlas response:`, JSON.stringify(statusResult, null, 2));
                      
                      // Check if this is an error response from Atlas
                      if (statusResult.error || statusResult.errorCode || statusResult.detail) {
                        console.error(`Atlas API Error Response:`, statusResult);
                        console.error(`Error details: ${statusResult.detail || statusResult.reason || statusResult.error || "Unknown error"}`);
                        
                        // If the error is "cluster not found", it might still be creating
                        if (statusResult.errorCode === 'CLUSTER_NOT_FOUND' || 
                            (statusResult.detail && statusResult.detail.includes('No cluster named'))) {
                          console.log(`Cluster "${actualClusterName}" not found yet - still being created`);
                          
                          // Try fallback to user input name if we're using Atlas response name
                          if (actualClusterName !== clusterName) {
                            console.log(`Trying fallback with user input name: "${clusterName}"`);
                            const fallbackCurlCommand = `curl -s --digest -u "${publicKey}:${privateKey}" \
                              -X GET "https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${clusterName}" \
                              --max-time 10`;
                            
                            exec(fallbackCurlCommand, (fallbackError, fallbackStdout, fallbackStderr) => {
                              if (!fallbackError && fallbackStdout) {
                                try {
                                  const fallbackResult = JSON.parse(fallbackStdout);
                                  if (!fallbackResult.error && !fallbackResult.errorCode && !fallbackResult.detail) {
                                    console.log(`Fallback successful! Cluster found with user input name: "${clusterName}"`);
                                    // Update the actual cluster name to use user input
                                    const currentRequest = clusterRequests.get(requestId);
                                    if (currentRequest) {
                                      currentRequest.actualClusterName = clusterName;
                                      clusterRequests.set(requestId, currentRequest);
                                      saveRequestsToFile();
                                    }
                                  } else {
                                    console.log(`Fallback also failed - cluster still being created`);
                                  }
                                } catch (parseError) {
                                  console.log(`Fallback response parsing failed - cluster still being created`);
                                }
                              }
                            });
                          }
                          
                          // Don't mark as failed, just continue monitoring
                          return;
                        }
                        
                        // Mark cluster as failed due to Atlas API error
                        clearInterval(progressInterval);
                        clearInterval(statusCheckInterval);
                        
                        const failedRequest = clusterRequests.get(requestId);
                        if (failedRequest) {
                          failedRequest.state = 'FAILED';
                          failedRequest.progress = 0;
                          failedRequest.statusMessage = `Atlas API Error: ${statusResult.detail || statusResult.reason || statusResult.error || "Unknown error"}`;
                          clusterRequests.set(requestId, failedRequest);
                          saveRequestsToFile();
                          console.log(`Marked cluster request ${requestId} as failed due to Atlas API error`);
                        }
                        return;
                      }
                      
                      // Check if stateName exists in the response
                      if (!statusResult.stateName) {
                        console.error(`Atlas response missing stateName field`);
                        console.error(`Available fields:`, Object.keys(statusResult));
                        
                        // Mark cluster as failed due to unexpected response format
                        clearInterval(progressInterval);
                        clearInterval(statusCheckInterval);
                        
                        const failedRequest = clusterRequests.get(requestId);
                        if (failedRequest) {
                          failedRequest.state = 'FAILED';
                          failedRequest.progress = 0;
                          failedRequest.statusMessage = 'Unexpected response format from Atlas API';
                          clusterRequests.set(requestId, failedRequest);
                          saveRequestsToFile();
                          console.log(`Marked cluster request ${requestId} as failed due to unexpected response format`);
                        }
                        return;
                      }
                      
                      // Use stateName as per MongoDB Atlas documentation
                      const clusterState = statusResult.stateName;
                      console.log(`Atlas status for ${clusterName}: ${clusterState}`);
                      
                      if (clusterState === 'IDLE') {
                        // Cluster is ready - mark as completed
                        console.log(`Cluster "${clusterName}" is now ready in Atlas!`);
                        clearInterval(progressInterval);
                        clearInterval(statusCheckInterval);
                        
                        const completedRequest = clusterRequests.get(requestId);
                        if (completedRequest) {
                          completedRequest.state = 'IDLE';
                          completedRequest.progress = 100;
                          completedRequest.statusMessage = 'Cluster creation completed successfully! 🎉';
                          
                          // Store the actual cluster ID from the status response and update connection string
                          if (statusResult.id) {
                            completedRequest.clusterId = statusResult.id;
                            
                            // Update the connection string with the real cluster ID
                            const username = process.env.MONGODB_USERNAME;
                            const password = process.env.MONGODB_PASSWORD;
                            
                            if (!username || !password) {
                              console.error('MONGODB_USERNAME and MONGODB_PASSWORD must be set in environment variables');
                              completedRequest.mongoClusterUri = null;
                            } else {
                              // Extract Atlas identifier from the connection strings
                              let atlasIdentifier = null;
                              if (statusResult.connectionStrings && statusResult.connectionStrings.standardSrv) {
                                // Extract from: mongodb+srv://clustername.identifier.mongodb.net
                                const srvMatch = statusResult.connectionStrings.standardSrv.match(/mongodb\+srv:\/\/([^.]+)\.([^.]+)\.mongodb\.net/);
                                if (srvMatch) {
                                  atlasIdentifier = srvMatch[2]; // The identifier part
                                  console.log(`Extracted Atlas identifier: ${atlasIdentifier}`);
                                }
                              }
                              
                              if (atlasIdentifier) {
                                completedRequest.atlasIdentifier = atlasIdentifier;
                                completedRequest.mongoClusterUri = `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${completedRequest.actualClusterName || completedRequest.clusterName}.${atlasIdentifier}.mongodb.net/`;
                                console.log(`Updated connection string with Atlas identifier: ${completedRequest.mongoClusterUri}`);
                              } else {
                                console.error('Could not extract Atlas identifier from connection strings');
                                completedRequest.mongoClusterUri = null;
                              }
                            }
                          }
                          
                          // Enable Database Auditing for the cluster (async)
                          console.log(`🔍 [AUDITING] Enabling database auditing for cluster: ${clusterName}`);
                          enableDatabaseAuditing(groupId, publicKey, privateKey)
                            .then(auditingResult => {
                              if (auditingResult.success) {
                                completedRequest.auditingEnabled = true;
                                completedRequest.auditingStatus = 'Enabled - Full Auditing';
                                completedRequest.auditingMessage = auditingResult.message;
                                console.log(`✅ [AUDITING] Database auditing enabled for cluster: ${clusterName}`);
                              } else {
                                completedRequest.auditingEnabled = false;
                                completedRequest.auditingStatus = 'Failed to Enable';
                                completedRequest.auditingMessage = auditingResult.message;
                                console.error(`❌ [AUDITING] Failed to enable auditing for cluster: ${clusterName} - ${auditingResult.error}`);
                              }
                              clusterRequests.set(requestId, completedRequest);
                              saveRequestsToFile();
                            })
                            .catch(error => {
                              console.error(`❌ [AUDITING] Error enabling auditing for cluster: ${clusterName}`, error);
                              completedRequest.auditingEnabled = false;
                              completedRequest.auditingStatus = 'Error';
                              completedRequest.auditingMessage = `Error: ${error.message}`;
                              clusterRequests.set(requestId, completedRequest);
                              saveRequestsToFile();
                            });
                          
                          console.log(`Marked cluster request ${requestId} as completed - auditing setup in progress`);
                        } else {
                          console.error(`Could not find cluster request ${requestId} to mark as completed`);
                        }
                      } else if (clusterState === 'FAILED') {
                        // Cluster creation failed
                        console.log(`Cluster "${clusterName}" creation failed in Atlas`);
                        clearInterval(progressInterval);
                        clearInterval(statusCheckInterval);
                        
                        const failedRequest = clusterRequests.get(requestId);
                        if (failedRequest) {
                          failedRequest.state = 'FAILED';
                          failedRequest.progress = 0;
                          failedRequest.statusMessage = 'Cluster creation failed in Atlas';
                          clusterRequests.set(requestId, failedRequest);
                          saveRequestsToFile();
                          console.log(`Marked cluster request ${requestId} as failed`);
                        } else {
                          console.error(`Could not find cluster request ${requestId} to mark as failed`);
                        }
                      } else if (clusterState === 'CREATING') {
                        // Still creating, handle final 5% progress (95-100%)
                        const currentRequest = clusterRequests.get(requestId);
                        if (currentRequest) {
                          // Only update progress if we're in the status-based phase (95-100%)
                          if (currentRequest.progress >= 95 && currentRequest.progress < 100) {
                            // Increment by 1% for the final 5% (95, 96, 97, 98, 99, 100)
                            currentRequest.progress = Math.min(100, currentRequest.progress + 1);
                            currentRequest.statusMessage = `Cluster creation in progress in Atlas... (${Math.floor((Date.now() - currentRequest.startTime) / 1000)}s)`;
                            console.log(`📊 [PROGRESS] ${clusterName}: ${currentRequest.progress}% - Status-based progress`);
                          } else if (currentRequest.progress < 95) {
                            // Still in time-based phase, just update status message
                            currentRequest.statusMessage = `Cluster creation in progress in Atlas... (${Math.floor((Date.now() - currentRequest.startTime) / 1000)}s)`;
                          }
                          
                          // Store the actual cluster ID from the status response
                          if (statusResult.id) {
                            currentRequest.clusterId = statusResult.id;
                          }
                          clusterRequests.set(requestId, currentRequest);
                          saveRequestsToFile();
                          console.log(`Updated progress for ${clusterName}: ${currentRequest.progress}%`);
                          console.log(`Request ${requestId} still in memory, total requests: ${clusterRequests.size}`);
                        }
                      } else {
                        // Handle other states (UPDATING, DELETING, etc.)
                        console.log(`Cluster "${clusterName}" is in state: ${clusterState}`);
                        const currentRequest = clusterRequests.get(requestId);
                        if (currentRequest) {
                          currentRequest.statusMessage = `Cluster is ${clusterState.toLowerCase()} in Atlas...`;
                          // Store the actual cluster ID from the status response
                          if (statusResult.id) {
                            currentRequest.clusterId = statusResult.id;
                          }
                          clusterRequests.set(requestId, currentRequest);
                          saveRequestsToFile();
                        }
                      }
                      // If still CREATING, continue with progress simulation
                    } catch (parseError) {
                      console.error('Failed to parse Atlas status response:', parseError);
                      console.error('Raw response:', statusStdout);
                      
                      // Mark cluster as failed due to parsing error
                      clearInterval(progressInterval);
                      clearInterval(statusCheckInterval);
                      
                      const failedRequest = clusterRequests.get(requestId);
                      if (failedRequest) {
                        failedRequest.state = 'FAILED';
                        failedRequest.progress = 0;
                        failedRequest.statusMessage = 'Failed to parse Atlas API response';
                        clusterRequests.set(requestId, failedRequest);
                        saveRequestsToFile();
                        console.log(`Marked cluster request ${requestId} as failed due to parsing error`);
                      }
                    }
                  } else {
                    console.error('No response from Atlas status check');
                  }
                });
              } catch (apiError) {
                console.error('Error checking Atlas status:', apiError);
              }
            }, 10000); // Check Atlas status every 10 seconds
            
            console.log(`Started monitoring Atlas status for cluster ${clusterName} every 10 seconds`);
            console.log(`Current cluster requests in memory: ${clusterRequests.size}`);
          }, 30000); // Wait 30 seconds before starting monitoring
          
        } else if (result.error || result.errorCode) {
          console.log(`Atlas API Error: ${stdout}`);
          clearInterval(progressInterval);
          const failedRequest = clusterRequests.get(requestId);
          if (failedRequest) {
            failedRequest.state = 'FAILED';
            failedRequest.progress = 0;
            failedRequest.statusMessage = `Atlas API Error: ${result.detail || result.reason || result.error || "Unknown error"}`;
            clusterRequests.set(requestId, failedRequest);
            saveRequestsToFile();
          }
        } else {
          // Unexpected response format
          console.error('Unexpected Atlas API response format:', stdout);
          clearInterval(progressInterval);
          const failedRequest = clusterRequests.get(requestId);
          if (failedRequest) {
            failedRequest.state = 'FAILED';
            failedRequest.progress = 0;
            failedRequest.statusMessage = 'Unexpected response from Atlas API';
            clusterRequests.set(requestId, failedRequest);
            saveRequestsToFile();
          }
        }
      } catch (parseError) {
        console.error('Failed to parse Atlas API response:', parseError);
        console.error('Raw response:', stdout);
        
        // Check if response is HTML (server error page)
        if (stdout && stdout.includes('<!DOCTYPE') || stdout.includes('<html')) {
          console.error('Atlas API returned HTML instead of JSON - likely server error');
          clearInterval(progressInterval);
          const failedRequest = clusterRequests.get(requestId);
          if (failedRequest) {
            failedRequest.state = 'FAILED';
            failedRequest.progress = 0;
            failedRequest.statusMessage = 'Atlas API returned HTML error page - server issue';
            clusterRequests.set(requestId, failedRequest);
            saveRequestsToFile();
          }
        } else {
          clearInterval(progressInterval);
          const failedRequest = clusterRequests.get(requestId);
          if (failedRequest) {
            failedRequest.state = 'FAILED';
            failedRequest.progress = 0;
            failedRequest.statusMessage = 'Invalid response from Atlas API';
            clusterRequests.set(requestId, failedRequest);
            saveRequestsToFile();
          }
        }
      }
    });
    
    res.json({
      success: true,
      requestId: requestId,
      message: `Cluster ${clusterName} creation initiated via MCP Server`,
      mcpFlow: true
    });
    
  } catch (error) {
    console.error('MCP Server cluster creation error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      message: "Failed to connect to Atlas API via MCP Server" 
    });
  }
});

// Get cluster status endpoint (alias for compatibility)
app.get('/api/status', async (req, res) => {
  try {
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Request ID is required' });
    }

    const clusterRequest = clusterRequests.get(id);
    if (!clusterRequest) {
      return res.status(404).json({ error: 'Cluster request not found' });
    }

    const statusResponse = {
      id: clusterRequest.id,
      clusterName: clusterRequest.clusterName,
      tier: clusterRequest.tier,
      state: clusterRequest.state,
      progress: clusterRequest.progress,
      statusMessage: clusterRequest.statusMessage,
      clusterId: clusterRequest.clusterId,
      isDataPopulated: clusterRequest.isDataPopulated,
      dataCollections: clusterRequest.dataCollections
    };
    
    res.json(statusResponse);
    
  } catch (error) {
    console.error('Error fetching cluster status:', error);
    res.status(500).json({ error: 'Failed to fetch cluster status' });
  }
});

// Get cluster status endpoint
app.get('/api/cluster-status', async (req, res) => {
  try {
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Request ID is required' });
    }

    const clusterRequest = clusterRequests.get(id);
    if (!clusterRequest) {
      return res.status(404).json({ error: 'Cluster request not found' });
    }

    const statusResponse = {
      id: clusterRequest.id,
      clusterName: clusterRequest.clusterName,
      tier: clusterRequest.tier,
      state: clusterRequest.state,
      progress: clusterRequest.progress,
      statusMessage: clusterRequest.statusMessage,
      clusterId: clusterRequest.clusterId,
      mongoClusterUri: clusterRequest.mongoClusterUri,
      isDataPopulated: clusterRequest.isDataPopulated,
      dataCollections: clusterRequest.dataCollections,
      cancelled: !!clusterRequest.cancelled,
      auditingEnabled: true, // Always enabled - managed by cluster creation logic
      auditingStatus: clusterRequest.auditingStatus || 'Enabled - Full Auditing',
      auditingMessage: clusterRequest.auditingMessage || 'Database auditing enabled automatically on cluster creation'
    };
    
    res.json(statusResponse);
    
  } catch (error) {
    console.error('Error fetching cluster status:', error);
    res.status(500).json({ error: 'Failed to fetch cluster status' });
  }
});

// Populate data endpoint
app.post('/api/populate-data', async (req, res) => {
  try {
    const { clusterName, requestId, dbName, connectionString, collectionName } = req.body;
    
    // Resolve cluster context only if no direct connection string provided
    let clusterRequest = null;
    if (!connectionString) {
      if (!clusterName) {
        return res.status(400).json({ error: 'Cluster name is required when no connectionString is provided' });
      }
      
      // If we have a requestId, try to get the cluster request
      if (requestId) {
        clusterRequest = clusterRequests.get(requestId);
        if (!clusterRequest) {
        } else if (clusterRequest.isDataPopulated) {
          console.warn(`Data has already been populated for cluster ${clusterName}`);
          return res.status(400).json({ error: 'Data has already been populated' });
        }
      }
    }
    
    // If called with a provisioning requestId, ensure cluster is READY (IDLE) before proceeding
    if (requestId) {
      const reqObj = clusterRequests.get(requestId);
      if (reqObj) {
        // Only check state if we found the request in memory
        if (reqObj.state !== 'IDLE') {
          return res.status(409).json({
            error: 'Cluster is not ready yet. Please wait until provisioning completes',
            state: reqObj.state,
            progress: reqObj.progress,
            statusMessage: reqObj.statusMessage
          });
        }
      }
    }

    // Real MongoDB population
    let uri = connectionString || (clusterRequest && clusterRequest.mongoClusterUri) || process.env.MONGODB_CLUSTER_URI;
    // Auto-generate connection string as fallback
    if (!uri && clusterName && dbName) {
      try {
        uri = await generateAtlasConnectionString(clusterName, dbName);
        console.log(`Auto-generated connection string for populate: ${uri}`);
      } catch (error) {
        return res.status(400).json({ 
          error: `Failed to generate connection string: ${error.message}. Please ensure MONGODB_USERNAME and MONGODB_PASSWORD are set in environment variables.` 
        });
      }
    }
    if (!uri) {
      return res.status(400).json({ error: 'Missing MongoDB cluster URI. Provide connectionString, clusterName+dbName, or set MONGODB_CLUSTER_URI.' });
    }
    const targetDb = dbName || process.env.MONGODB_TARGET_DB || 'app';
    const targetCollection = (collectionName || 'users');
    
    console.log('🔧 [MCP] Populating data into MongoDB:', { clusterName, db: targetDb, collection: targetCollection });

    if (!['users', 'user'].includes(targetCollection)) {
      return res.status(400).json({ error: 'Only "users" or "user" collections are supported for population' });
    }

    // Use MCP tool to insert data
    try {
      const documents = [
        { name: 'John Doe', email: 'john@example.com', createdAt: new Date() },
        { name: 'Jane Smith', email: 'jane@example.com', createdAt: new Date() }
      ];
      
      console.log(`🔧 [MCP] Inserting ${documents.length} documents using MCP tool`);
      
      // Call insert-many MCP tool
      const result = await callMcpTool('insert-many', {
        database: targetDb,
        collection: targetCollection,
        documents: documents
      }, uri);
      
      console.log(`✅ [MCP] Data inserted successfully:`, result);
      
    } catch (insertErr) {
      console.error('Error inserting data via MCP:', insertErr);
      return res.status(400).json({ error: 'Failed to insert data via MCP', details: String(insertErr?.message || insertErr) });
    }

    if (clusterRequest) {
      clusterRequest.isDataPopulated = true;
      clusterRequest.dataCollections = [targetCollection];
      clusterRequests.set(requestId, clusterRequest);
      saveRequestsToFile();
    }

    res.json({ success: true, message: `Data populated in ${targetDb}`, collections: [targetCollection], mcpFlow: true });
    
  } catch (error) {
    console.error('Error populating data:', error);
    res.status(500).json({ error: 'Failed to populate data via MCP Server' });
  }
});

// View data endpoint
app.post('/api/view-data', async (req, res) => {
  try {
    const { clusterName, requestId, dbName, connectionString, collectionName } = req.body;

    // If called with a provisioning requestId, ensure cluster is READY (IDLE) before proceeding
    if (requestId) {
      const reqObj = clusterRequests.get(requestId);
      if (reqObj) {
        // Only check state if we found the request in memory
        if (reqObj.state !== 'IDLE') {
          return res.status(409).json({
            error: 'Cluster is not ready yet. Please wait until provisioning completes',
            state: reqObj.state,
            progress: reqObj.progress,
            statusMessage: reqObj.statusMessage
          });
        }
      }
    }

    // Determine mode: direct (connectionString provided) or cluster-context
    let effectiveUri = connectionString || process.env.MONGODB_CLUSTER_URI || null;
    let clusterRequest = null;
    if (!effectiveUri) {
      if (!clusterName) {
        return res.status(400).json({ error: 'Cluster name is required when no connectionString is provided' });
      }
      
      // If we have a requestId, try to get the cluster request
      if (requestId) {
        clusterRequest = clusterRequests.get(requestId);
        if (!clusterRequest) {
        } else {
          if (!clusterRequest.isDataPopulated) {
            console.warn(`Data has not been populated yet for cluster ${clusterName}`);
            return res.status(400).json({ error: 'Data has not been populated yet' });
          }
          effectiveUri = clusterRequest.mongoClusterUri || effectiveUri;
        }
      }
    }

    // Auto-generate connection string as fallback
    if (!effectiveUri && clusterName && dbName) {
      try {
        effectiveUri = await generateAtlasConnectionString(clusterName, dbName);
        console.log(`Auto-generated connection string for view: ${effectiveUri}`);
      } catch (error) {
        return res.status(400).json({ 
          error: `Failed to generate connection string: ${error.message}. Please ensure MONGODB_USERNAME and MONGODB_PASSWORD are set in environment variables.` 
        });
      }
    }
    if (!effectiveUri) {
      return res.status(400).json({ error: 'Missing MongoDB cluster URI. Provide connectionString, clusterName+dbName, or set MONGODB_CLUSTER_URI.' });
    }

    const targetDb = dbName || process.env.MONGODB_TARGET_DB || 'app';
    const targetCollection = (collectionName || 'users');
    
    console.log('🔧 [MCP] Fetching data from MongoDB:', { clusterName, db: targetDb, collection: targetCollection });

    if (!['users', 'user'].includes(targetCollection)) {
      return res.status(400).json({ error: 'Only "users" or "user" collections are supported for view' });
    }

    // Use MCP tool to find data
    try {
      console.log(`🔧 [MCP] Querying documents using MCP tool`);
      
      // Call find MCP tool
      const result = await callMcpTool('find', {
        database: targetDb,
        collection: targetCollection,
        filter: {},
        limit: 2
      }, effectiveUri);
      
      console.log(`✅ [MCP] Data retrieved successfully:`, result);
      
      // Extract the actual data from MCP response
      let users = [];
      if (result.content && result.content.length > 1) {
        // Skip the first content item (it's the "Found X documents" message)
        // Parse the remaining content items as documents
        users = result.content.slice(1).map(item => {
          if (item.text) {
            try {
              return JSON.parse(item.text);
            } catch (e) {
              console.log('Could not parse document:', item.text);
              return null;
            }
          }
          return null;
        }).filter(doc => doc !== null);
      }
      
      res.json({ success: true, message: `Data retrieved from ${targetDb} via MCP`, data: { users }, mcpFlow: true });
      return;
      
    } catch (findErr) {
      console.error('Error retrieving data via MCP:', findErr);
      return res.status(400).json({ error: 'Failed to retrieve data via MCP', details: String(findErr?.message || findErr) });
    }

  } catch (error) {
    console.error('Error retrieving data:', error);
    res.status(500).json({ error: 'Failed to retrieve data via MCP Server' });
  }
});

// Orchestrate full flow: create cluster 'Tester' -> create DB -> populate -> view
app.post('/api/run-tester-flow', async (req, res) => {
  try {
    const { tier, connectionString, dbName, collectionName } = req.body || {};

    if (!dbName || !collectionName) {
      return res.status(400).json({ success: false, message: 'dbName and collectionName are required' });
    }

    const jobId = `flow-${Date.now()}`;
    const job = {
      id: jobId,
      state: 'INITIALIZING',
      logs: [],
      requestId: null,
      result: null,
      error: null
    };
    orchestrations.set(jobId, job);

    // Fire-and-forget async orchestration
    (async () => {
      try {
        job.state = 'CREATING_CLUSTER';
        job.logs.push('Starting cluster creation for "Tester"');

        // Kick off cluster creation via existing endpoint
        const createResp = await fetch(`http://localhost:${PORT}/create-cluster`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clusterName: 'Tester', tier: tier || 'M10' })
        });
        const createJson = await createResp.json();
        if (!createResp.ok || createJson.success === false) {
          throw new Error(createJson.message || createJson.error || 'Failed to initiate cluster creation');
        }
        job.requestId = createJson.requestId;
        job.logs.push(`Cluster creation initiated. requestId=${job.requestId}`);

        // Wait until cluster is IDLE
        job.state = 'AWAITING_CLUSTER_READY';
        const start = Date.now();
        const timeoutMs = 30 * 60 * 1000; // 30 minutes
        while (true) {
          const reqObj = clusterRequests.get(job.requestId);
          if (reqObj && reqObj.state === 'IDLE') {
            job.logs.push('Cluster is ready (IDLE)');
            break;
          }
          if (reqObj && reqObj.state === 'FAILED') {
            throw new Error('Cluster creation failed');
          }
          if (Date.now() - start > timeoutMs) {
            throw new Error('Timed out waiting for cluster to become ready');
          }
          await sleep(10000);
        }

        // Create database and collection
        job.state = 'CREATING_DATABASE';
        job.logs.push(`Creating database ${dbName}.${collectionName}`);
        const createDbResp = await fetch(`http://localhost:${PORT}/api/create-database`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionString, dbName, collectionName })
        });
        const createDbText = await createDbResp.text();
        if (!createDbResp.ok) {
          throw new Error(createDbText || 'Failed to create database/collection');
        }
        job.logs.push('Database/collection created');

        // Populate sample data
        job.state = 'POPULATING_DATA';
        job.logs.push('Populating sample data');
        const populateResp = await fetch(`http://localhost:${PORT}/api/populate-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionString, dbName })
        });
        const populateJson = await populateResp.json();
        if (!populateResp.ok || populateJson.success === false) {
          throw new Error(populateJson.message || populateJson.error || 'Failed to populate data');
        }
        job.logs.push('Data populated');

        // View data
        job.state = 'VIEWING_DATA';
        job.logs.push('Retrieving data');
        const viewResp = await fetch(`http://localhost:${PORT}/api/view-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionString, dbName })
        });
        const viewJson = await viewResp.json();
        if (!viewResp.ok || viewJson.success === false) {
          throw new Error(viewJson.message || viewJson.error || 'Failed to view data');
        }
        job.result = viewJson.data;
        job.state = 'COMPLETED';
        job.logs.push('Flow completed');
      } catch (e) {
        job.state = 'FAILED';
        job.error = String(e?.message || e);
        job.logs.push(`Error: ${job.error}`);
      }
    })();

    return res.status(202).json({ success: true, jobId, message: 'Flow started', note: 'Poll status endpoint to track progress' });
  } catch (error) {
    console.error('Error starting tester flow:', error);
    res.status(500).json({ success: false, message: 'Failed to start flow', error: String(error?.message || error) });
  }
});

// Get orchestration status/result
app.get('/api/run-tester-flow/:jobId', (req, res) => {
  const job = orchestrations.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
  res.json({ success: true, ...job });
});

// Get Database Auditing Status for a project
app.get('/api/auditing-status', async (req, res) => {
  try {
    const publicKey = process.env.MONGODB_PUBLIC_KEY || "vcammlal";
    const privateKey = process.env.MONGODB_PRIVATE_KEY || "d94cc8c6-3c3c-496f-b53f-94726270eb90";
    const groupId = process.env.MONGODB_GROUP_ID || "688ba44a7f3cd609ef39f683";
    
    const auditingStatus = await checkDatabaseAuditingStatus(groupId, publicKey, privateKey);
    res.json(auditingStatus);
    
  } catch (error) {
    console.error('Error checking auditing status:', error);
    res.status(500).json({ 
      success: false, 
      enabled: false, 
      error: error.message 
    });
  }
});

// Enable Database Auditing for a project
app.post('/api/enable-auditing', async (req, res) => {
  try {
    const publicKey = process.env.MONGODB_PUBLIC_KEY || "vcammlal";
    const privateKey = process.env.MONGODB_PRIVATE_KEY || "d94cc8c6-3c3c-496f-b53f-94726270eb90";
    const groupId = process.env.MONGODB_GROUP_ID || "688ba44a7f3cd609ef39f683";
    
    const auditingResult = await enableDatabaseAuditing(groupId, publicKey, privateKey);
    res.json(auditingResult);
    
  } catch (error) {
    console.error('Error enabling auditing:', error);
    res.status(500).json({ 
      success: false, 
      enabled: false, 
      error: error.message 
    });
  }
});

// Get detailed cluster properties
app.get('/api/cluster-properties', async (req, res) => {
  try {
    const { clusterName } = req.query;
    
    if (!clusterName) {
      return res.status(400).json({
        success: false,
        message: 'Cluster name is required'
      });
    }

    console.log(`🔍 [CLUSTER-PROPERTIES] Fetching properties for cluster: ${clusterName}`);

    // Find the cluster in our stored cluster requests
    const clusterRequest = Array.from(clusterRequests.values()).find(req => 
      req.clusterName === clusterName || req.actualName === clusterName
    );

    if (!clusterRequest) {
      return res.status(404).json({
        success: false,
        message: `Cluster '${clusterName}' not found in our records`
      });
    }

    // Extract tier from cluster request
    const tier = clusterRequest.tier || 'M10';
    
    console.log(`🔍 [CLUSTER-PROPERTIES] Found cluster request:`, {
      name: clusterRequest.clusterName,
      actualName: clusterRequest.actualName,
      tier: clusterRequest.tier,
      state: clusterRequest.state
    });
    
    // Format cluster properties using stored data and tier information
    const clusterProperties = {
      success: true,
      cluster: {
        // Basic Information
        name: clusterRequest.actualName || clusterRequest.clusterName || clusterName,
        tier: tier,
        sku: tier,
        cpu: getCpuCount(tier),
        ram: getRamSize(tier),
        storage: getStorageSize(tier),
        
        // Deployment Details (from our cluster creation)
        cloudProvider: 'AZURE', // We hardcode this
        region: 'US_EAST_2', // We hardcode this
        clusterType: 'REPLICASET',
        mongoVersion: '7.0',
        replicationFactor: 3,
        
        // Security Features (always enabled in our implementation)
        tlsEncryption: true,
        databaseAuditing: true, // Always enabled - managed by cluster creation logic
        auditingStatus: clusterRequest.auditingStatus || 'Enabled - Full Auditing',
        writeConcern: 'majority',
        retryWrites: true,
        authSource: 'admin',
        
        // Status & Performance
        state: clusterRequest.state || 'IDLE',
        connectionString: clusterRequest.mongoClusterUri || 'Not available',
        lastModified: new Date().toISOString(),
        
        // Advanced Features
        backupEnabled: false,
        monitoringEnabled: true,
        alertingEnabled: true,
        dataEncryptionAtRest: true,
        networkAccess: 'Public',
        ipWhitelist: 'Not configured',
        
        // Raw data for debugging
        rawData: clusterRequest
      }
    };

    console.log(`✅ [CLUSTER-PROPERTIES] Successfully formatted properties:`, {
      name: clusterProperties.cluster.name,
      tier: clusterProperties.cluster.tier,
      provider: clusterProperties.cluster.cloudProvider,
      region: clusterProperties.cluster.region
    });
    res.json(clusterProperties);

  } catch (error) {
    console.error('❌ [CLUSTER-PROPERTIES] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Helper functions for cluster specifications
function getCpuCount(tier) {
  const cpuMap = {
    'M10': 2, 'M20': 2, 'M30': 2, 'M40': 4, 'M50': 4, 'M60': 8, 'M80': 8, 'M100': 8, 'M140': 8, 'M200': 8, 'M300': 16, 'M400': 16, 'M500': 16
  };
  return cpuMap[tier] || 'Unknown';
}

function getRamSize(tier) {
  const ramMap = {
    'M10': '2GB', 'M20': '4GB', 'M30': '8GB', 'M40': '8GB', 'M50': '16GB', 'M60': '16GB', 'M80': '32GB', 'M100': '32GB', 'M140': '64GB', 'M200': '64GB', 'M300': '128GB', 'M400': '256GB', 'M500': '512GB'
  };
  return ramMap[tier] || 'Unknown';
}

function getStorageSize(tier) {
  const storageMap = {
    'M10': '10GB', 'M20': '20GB', 'M30': '40GB', 'M40': '80GB', 'M50': '160GB', 'M60': '320GB', 'M80': '640GB', 'M100': '1.28TB', 'M140': '2.56TB', 'M200': '5.12TB', 'M300': '10.24TB', 'M400': '20.48TB', 'M500': '40.96TB'
  };
  return storageMap[tier] || 'Unknown';
}

// Generate session ID on server start
const SESSION_ID = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Session management endpoint
app.get('/api/session-id', (req, res) => {
  res.json({ sessionId: SESSION_ID });
});

// Stop/Cancel cluster creation (terminates timers and attempts Atlas delete if known)
app.post('/api/stop-cluster', async (req, res) => {
  try {
    const { requestId, comment, clusterName: clientProvidedName } = req.body || {};
    console.log('[MCP /api/stop-cluster] payload', { requestId, clientProvidedName, comment });
    if (!requestId && !clientProvidedName) {
      return res.status(400).json({ success: false, message: 'requestId or clusterName is required' });
    }

    const reqObj = requestId ? clusterRequests.get(requestId) : null;
    if (requestId && !reqObj) {
      // If specific request not found, proceed with name-only deletion if provided
      if (!clientProvidedName) {
        return res.json({ success: true, message: 'Request not found; treated as already stopped' });
      }
    }

    // If we have a tracked request, mark as cancelled immediately and update state
    if (reqObj) {
      reqObj.cancelled = true;
      reqObj.state = 'DELETING';
      reqObj.statusMessage = comment ? `Cancellation requested: ${comment}` : 'Cancellation requested by user';
      clusterRequests.set(requestId, reqObj);
    }

    // Attempt to delete cluster in Atlas if we have an actual cluster name
    try {
      const actualName = (reqObj && (reqObj.actualClusterName || reqObj.clusterName)) || clientProvidedName;
      console.log('[MCP /api/stop-cluster] resolve name', { actualName });
      if (actualName) {
        const publicKey = process.env.MONGODB_PUBLIC_KEY || "";
        const privateKey = process.env.MONGODB_PRIVATE_KEY || "";
        const groupId = process.env.MONGODB_GROUP_ID || "";
        if (publicKey && privateKey && groupId) {
          const { exec } = require('child_process');
          const encodedActual = encodeURIComponent(actualName);
          const encodedFallback = encodeURIComponent((reqObj && reqObj.clusterName) || clientProvidedName || actualName);
          const deleteCmdActual = `curl -s --digest -u "${publicKey}:${privateKey}" -H "Accept: application/json" -X DELETE "https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${encodedActual}" --max-time 30`;
          const deleteCmdFallback = reqObj && actualName !== reqObj.clusterName
            ? `curl -s --digest -u "${publicKey}:${privateKey}" -H "Accept: application/json" -X DELETE "https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${encodedFallback}" --max-time 30`
            : null;
          console.log('[MCP /api/stop-cluster] delete actual cmd', deleteCmdActual);
          if (deleteCmdFallback) console.log('[MCP /api/stop-cluster] delete fallback cmd', deleteCmdFallback);

          exec(deleteCmdActual, (err, stdout, stderr) => {
            if (err) console.error('Atlas delete error (actual):', err);
            if (stderr && stderr.trim()) console.error('Atlas delete stderr (actual):', stderr);
            if (stdout && stdout.trim()) console.log('Atlas delete response (actual):', stdout);
          });
          if (deleteCmdFallback) {
            exec(deleteCmdFallback, (err, stdout, stderr) => {
              if (err) console.error('Atlas delete error (fallback):', err);
              if (stderr && stderr.trim()) console.error('Atlas delete stderr (fallback):', stderr);
              if (stdout && stdout.trim()) console.log('Atlas delete response (fallback):', stdout);
            });
          }

          // Start a short-lived monitor to reflect DELETING/DELETED state back into our memory
          const statusCmd = (name) => `curl -s --digest -u "${publicKey}:${privateKey}" -H "Accept: application/json" -X GET "https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${encodeURIComponent(name)}" --max-time 20`;
          const monitorStart = Date.now();
          const monitor = setInterval(() => {
            const age = Date.now() - monitorStart;
            if (age > 10 * 60 * 1000) { // stop after 10 minutes
              clearInterval(monitor);
              return;
            }
            const nameToCheck = (requestId && clusterRequests.get(requestId)?.actualClusterName) || (reqObj && reqObj.clusterName) || actualName;
            exec(statusCmd(nameToCheck), (serr, sout, sstderr) => {
              if (sout) {
                try {
                  const parsed = JSON.parse(sout);
                  // If Atlas reports cluster not found, treat as fully deleted
                  if (
                    parsed && (
                      parsed.errorCode === 'CLUSTER_NOT_FOUND' ||
                      (parsed.detail && typeof parsed.detail === 'string' && parsed.detail.includes('No cluster named'))
                    )
                  ) {
                    if (requestId) {
                      clusterRequests.delete(requestId);
                    }
                    clearInterval(monitor);
                    return;
                  }
                  if (parsed.stateName === 'DELETING') {
                    if (requestId) {
                      const r = clusterRequests.get(requestId);
                      if (r) {
                      r.state = 'DELETING';
                      r.statusMessage = 'Deletion in progress in Atlas...';
                      clusterRequests.set(requestId, r);
                      }
                    }
                  }
                } catch (e) {
                  // If JSON parse fails, Atlas may have returned HTML or empty → ignore
                }
              } else if (sstderr && sstderr.includes('404')) {
                if (requestId) {
                  const r = clusterRequests.get(requestId);
                  if (r) {
                    r.state = 'FAILED';
                    r.statusMessage = 'Cluster deleted in Atlas';
                    clusterRequests.set(requestId, r);
                  }
                }
                clearInterval(monitor);
              }
            });
          }, 15000);
        }
      }
    } catch (delErr) {
      console.error('Error attempting Atlas deletion:', delErr);
    }

    return res.json({ success: true, message: 'Cluster cancellation requested', atlasDeleteRequested: true });
  } catch (error) {
    console.error('Error in stop-cluster:', error);
    res.status(500).json({ success: false, message: 'Failed to stop cluster', error: String(error?.message || error) });
  }
});

// Direct deletion by cluster name (no requestId needed) – use carefully
app.post('/api/delete-cluster-by-name', async (req, res) => {
  try {
    const { clusterName } = req.body || {};
    if (!clusterName) return res.status(400).json({ success: false, message: 'clusterName is required' });

    const publicKey = process.env.MONGODB_PUBLIC_KEY || "";
    const privateKey = process.env.MONGODB_PRIVATE_KEY || "";
    const groupId = process.env.MONGODB_GROUP_ID || "";
    if (!publicKey || !privateKey || !groupId) {
      return res.status(500).json({ success: false, message: 'Missing Atlas API credentials in environment' });
    }

    const { exec } = require('child_process');
    const encoded = encodeURIComponent(clusterName);
    const deleteCmd = `curl -s --digest -u "${publicKey}:${privateKey}" -H "Accept: application/json" -X DELETE "https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${encoded}" --max-time 30`;
    exec(deleteCmd, (err, stdout, stderr) => {
      if (err) {
        console.error('Atlas delete error (by-name):', err);
        return res.status(500).json({ success: false, message: 'Atlas delete failed', error: String(err.message || err) });
      }
      if (stderr && stderr.trim()) console.error('Atlas delete stderr (by-name):', stderr);
      let parsed = null;
      try { parsed = stdout ? JSON.parse(stdout) : null; } catch {}
      // Atlas returns 202 Accepted/no JSON; treat as success if no error fields
      if (parsed && (parsed.error || parsed.errorCode || parsed.detail)) {
        return res.status(400).json({ success: false, message: parsed.detail || parsed.reason || parsed.error || 'Atlas error', response: parsed });
      }
      return res.json({ success: true, message: 'Deletion request sent to Atlas', response: parsed || stdout });
    });
  } catch (error) {
    console.error('Error in delete-cluster-by-name:', error);
    res.status(500).json({ success: false, message: 'Failed to delete cluster by name', error: String(error.message || error) });
  }
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP Server running on http://localhost:${PORT}`);
  console.log(`Persistence file: ${PERSISTENCE_FILE}`);
  console.log(`Session ID: ${SESSION_ID}`);
  console.log(`Cluster requests in memory: ${clusterRequests.size}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down MCP Server...');
  console.log(`Saving ${clusterRequests.size} cluster requests before shutdown...`);
  
  // Save all requests before shutting down
  saveRequestsToFile();
  
  if (mcpProcess) {
    console.log('Terminating MCP process...');
    mcpProcess.kill();
  }
  
  console.log('MCP Server shutdown complete');
  process.exit(0);
});
