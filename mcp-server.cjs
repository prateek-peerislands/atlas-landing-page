#!/usr/bin/env node

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.MCP_SERVER_PORT || 3001;

// Enable CORS for frontend communication
app.use(cors());
app.use(express.json());

console.log('Starting MCP Server on port', PORT);

// Store MCP process reference
let mcpProcess = null;

// Store cluster requests for status tracking with persistence
const clusterRequests = new Map();

// Orchestration jobs state (for full demo flows)
const orchestrations = new Map();

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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

// Persistence file path
const PERSISTENCE_FILE = path.join(__dirname, 'cluster-requests.json');

// Load persisted cluster requests on startup with cleanup
function loadPersistedRequests() {
  try {
    if (fs.existsSync(PERSISTENCE_FILE)) {
      const data = fs.readFileSync(PERSISTENCE_FILE, 'utf8');
      const requests = JSON.parse(data);
      console.log(`Loaded ${requests.length} persisted cluster requests`);
      
      // Clean up old/failed requests and keep only active ones
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      
      requests.forEach(request => {
        const requestAge = now - request.startTime;
        
        // Keep only:
        // 1. Active requests (CREATING, INITIALIZING) that are less than 24 hours old
        // 2. Successfully completed requests (IDLE) that are less than 24 hours old
        // 3. Failed requests that are less than 1 hour old (for debugging)
        
        if (request.state === 'IDLE' && requestAge < maxAge) {
          // Keep recent successful clusters
          clusterRequests.set(request.id, request);
        } else if (request.state === 'CREATING' || request.state === 'INITIALIZING') {
          if (requestAge < maxAge) {
            // Keep recent active clusters
            clusterRequests.set(request.id, request);
          } else {
            // Mark old stuck clusters as failed
            request.state = 'FAILED';
            request.statusMessage = 'Cluster creation timed out (older than 24 hours)';
            clusterRequests.set(request.id, request);
          }
        } else if (request.state === 'FAILED' && requestAge < (60 * 60 * 1000)) {
          // Keep recent failed clusters for debugging (1 hour)
          clusterRequests.set(request.id, request);
        }
        // Discard old failed/stuck requests
      });
      
      // Save cleaned up requests
      saveRequestsToFile();
      console.log(`After cleanup: ${clusterRequests.size} active cluster requests remain`);
    }
  } catch (error) {
    console.error('Failed to load persisted requests:', error);
  }
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
        return res.status(404).json({ success: false, message: 'Cluster request not found' });
      }
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

    // Resolve connection string from request or environment
    let uri = connectionString || null;
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
    if (!uri) {
      return res.status(400).json({ success: false, message: 'Missing MongoDB connection. Provide connectionString or set MONGODB_CLUSTER_URI (or *_DB_USER/_DB_PASSWORD/_SRV) in env.' });
    }

    let client;
    try {
      client = await getMongoClient(uri);
    } catch (connErr) {
      return res.status(400).json({ success: false, message: 'Failed to connect to MongoDB with provided connection', error: String(connErr?.message || connErr) });
    }
    // Quick connectivity check with ping for clearer errors
    try {
      await client.db('admin').command({ ping: 1 });
    } catch (pingErr) {
      return res.status(400).json({ success: false, message: 'Connected, but ping failed', error: String(pingErr?.message || pingErr) });
    }
    const db = client.db(dbName);

    const pref = (preference || 'regular').toLowerCase();
    try {
      if (pref === 'timeseries' || pref === 'time series' || pref === 'time_series') {
        if (!timeField) {
          return res.status(400).json({ success: false, message: 'timeField is required for time series collections' });
        }
        await db.createCollection(collectionName, {
          timeseries: {
            timeField,
            metaField: metaField || undefined
          }
        });
      } else if (pref === 'clustered' || pref === 'clustered_index' || pref === 'clustered index') {
        // Expect clusteredIndexKey as an object like { field: 1 }
        if (!clusteredIndexKey || typeof clusteredIndexKey !== 'object') {
          return res.status(400).json({ success: false, message: 'clusteredIndexKey object is required for clustered collections' });
        }
        await db.createCollection(collectionName, {
          clusteredIndex: {
            key: clusteredIndexKey,
            unique: true
          }
        });
      } else {
        await db.createCollection(collectionName);
      }
    } catch (createErr) {
      // Treat "collection exists" as success (idempotent)
      const msg = String(createErr?.message || createErr);
      if (msg.includes('NamespaceExists') || msg.includes('already exists')) {
        return res.json({ success: true, message: 'Collection already exists', dbName, collectionName, preference: pref });
      }
      return res.status(400).json({ success: false, message: 'Failed to create collection', error: msg });
    }

    return res.json({ success: true, message: 'Database/collection created', dbName, collectionName, preference: pref });
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

    // Validate tier
    const validTiers = ['M10', 'M20', 'M30'];
    if (!validTiers.includes(tier)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tier. Must be one of: M10, M20, M30"
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
      progress: 10,
      startTime: Date.now(),
      statusMessage: 'Initializing cluster creation...',
      isDataPopulated: false,
      dataCollections: []
    };
    
    clusterRequests.set(requestId, clusterRequest);
    saveRequestsToFile();
    
    // Start progress simulation - 8 minutes total, update every 40 seconds
    const totalDuration = 8 * 60 * 1000; // 8 minutes in milliseconds
    const updateInterval = 40 * 1000; // 40 seconds in milliseconds
    
    const progressInterval = setInterval(() => {
      const currentRequest = clusterRequests.get(requestId);
      if (!currentRequest) {
        clearInterval(progressInterval);
        return;
      }
      
      // Calculate elapsed time and progress
      const elapsed = Date.now() - currentRequest.startTime;
      const elapsedSeconds = Math.floor(elapsed / 1000);
      
      // Update progress gradually from 10% to 95% (not 90%)
      if (currentRequest.progress < 95) {
        currentRequest.progress = Math.min(95, Math.round(10 + (elapsed / totalDuration) * 85));
        
        // Update status message based on progress
        if (currentRequest.progress < 25) {
          currentRequest.statusMessage = `Initializing cluster configuration... (${elapsedSeconds}s)`;
        } else if (currentRequest.progress < 40) {
          currentRequest.statusMessage = `Provisioning cloud infrastructure... (${elapsedSeconds}s)`;
        } else if (currentRequest.progress < 55) {
          currentRequest.statusMessage = `Setting up MongoDB instances... (${elapsedSeconds}s)`;
        } else if (currentRequest.progress < 70) {
          currentRequest.statusMessage = `Configuring replication and security... (${elapsedSeconds}s)`;
        } else if (currentRequest.progress < 85) {
          currentRequest.statusMessage = `Finalizing cluster setup... (${elapsedSeconds}s)`;
        } else {
          currentRequest.statusMessage = `Almost complete... (${elapsedSeconds}s)`;
        }
        
        saveRequestsToFile();
      }
    }, updateInterval);
    
    // Create real cluster in MongoDB Atlas
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
            currentRequest.state = 'CREATING';
            currentRequest.progress = 20;
            currentRequest.statusMessage = 'Cluster creation in progress in Atlas...';
            clusterRequests.set(requestId, currentRequest);
            saveRequestsToFile();
            console.log(`Updated cluster request ${requestId} with Atlas cluster ID ${atlasClusterId} and name ${actualClusterName}`);
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
              
              console.log(`Checking Atlas status for cluster "${clusterName}"...`);
              
              try {
                // Use the actual cluster name that Atlas expects, not the user input
                const currentRequest = clusterRequests.get(requestId);
                const actualClusterName = currentRequest?.actualClusterName || clusterName;
                
                console.log(`Using actual cluster name for status check: "${actualClusterName}" (user input: "${clusterName}")`);
                
                // Use cluster name instead of ID for status check - this is more reliable
                const statusCurlCommand = `curl -s --digest -u "${publicKey}:${privateKey}" \
                  -X GET "https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${actualClusterName}" \
                  --max-time 10`;
                
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
                          // Store the actual cluster ID from the status response
                          if (statusResult.id) {
                            completedRequest.clusterId = statusResult.id;
                          }
                          clusterRequests.set(requestId, completedRequest);
                          saveRequestsToFile();
                          console.log(`Marked cluster request ${requestId} as completed`);
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
                        // Still creating, update progress and ensure request stays in memory
                        const currentRequest = clusterRequests.get(requestId);
                        if (currentRequest && currentRequest.progress < 95) {
                          currentRequest.progress = Math.min(95, currentRequest.progress + 5);
                          currentRequest.statusMessage = `Cluster creation in progress in Atlas... (${Math.floor((Date.now() - currentRequest.startTime) / 1000)}s)`;
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
      isDataPopulated: clusterRequest.isDataPopulated,
      dataCollections: clusterRequest.dataCollections
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
      if (!clusterName || !requestId) {
        return res.status(400).json({ error: 'Cluster name and request ID are required when no connectionString is provided' });
      }
      clusterRequest = clusterRequests.get(requestId);
      if (!clusterRequest) {
        return res.status(404).json({ error: 'Cluster request not found' });
      }
      if (clusterRequest.isDataPopulated) {
        console.warn(`Data has already been populated for cluster ${clusterName}`);
        return res.status(400).json({ error: 'Data has already been populated' });
      }
    }
    
    // If called with a provisioning requestId, ensure cluster is READY (IDLE) before proceeding
    if (requestId) {
      const reqObj = clusterRequests.get(requestId);
      if (!reqObj) {
        return res.status(404).json({ error: 'Cluster request not found' });
      }
      if (reqObj.state !== 'IDLE') {
        return res.status(409).json({
          error: 'Cluster is not ready yet. Please wait until provisioning completes',
          state: reqObj.state,
          progress: reqObj.progress,
          statusMessage: reqObj.statusMessage
        });
      }
    }

    // Real MongoDB population
    const uri = connectionString || (clusterRequest && clusterRequest.mongoClusterUri) || process.env.MONGODB_CLUSTER_URI;
    if (!uri) {
      return res.status(400).json({ error: 'Missing MongoDB cluster URI. Set MONGODB_CLUSTER_URI or configure cluster request with mongoClusterUri.' });
    }
    const targetDb = dbName || process.env.MONGODB_TARGET_DB || 'app';
    const targetCollection = (collectionName || 'users');
    const client = await getMongoClient(uri);
    const db = client.db(targetDb);
    console.log('Populating real data into MongoDB:', { clusterName, db: targetDb, collection: targetCollection });

    if (!['users', 'user'].includes(targetCollection)) {
      return res.status(400).json({ error: 'Only "users" or "user" collections are supported for population' });
    }

    await db.collection(targetCollection).insertMany([
      { name: 'John Doe', email: 'john@example.com', createdAt: new Date() },
      { name: 'Jane Smith', email: 'jane@example.com', createdAt: new Date() }
    ]);

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
      if (!reqObj) {
        return res.status(404).json({ error: 'Cluster request not found' });
      }
      if (reqObj.state !== 'IDLE') {
        return res.status(409).json({
          error: 'Cluster is not ready yet. Please wait until provisioning completes',
          state: reqObj.state,
          progress: reqObj.progress,
          statusMessage: reqObj.statusMessage
        });
      }
    }

    // Determine mode: direct (connectionString provided) or cluster-context
    let effectiveUri = connectionString || process.env.MONGODB_CLUSTER_URI || null;
    let clusterRequest = null;
    if (!effectiveUri) {
      if (!clusterName || !requestId) {
        return res.status(400).json({ error: 'Cluster name and request ID are required when no connectionString is provided' });
      }
      clusterRequest = clusterRequests.get(requestId);
      if (!clusterRequest) {
        return res.status(404).json({ error: 'Cluster request not found' });
      }
      if (!clusterRequest.isDataPopulated) {
        console.warn(`Data has not been populated yet for cluster ${clusterName}`);
        return res.status(400).json({ error: 'Data has not been populated yet' });
      }
      effectiveUri = clusterRequest.mongoClusterUri || effectiveUri;
    }

    if (!effectiveUri) {
      return res.status(400).json({ error: 'Missing MongoDB cluster URI. Provide connectionString or set MONGODB_CLUSTER_URI.' });
    }

    const targetDb = dbName || process.env.MONGODB_TARGET_DB || 'app';
    const targetCollection = (collectionName || 'users');
    const client = await getMongoClient(effectiveUri);
    const db = client.db(targetDb);
    console.log('Fetching real data from MongoDB:', { clusterName, db: targetDb, collection: targetCollection });

    if (!['users', 'user'].includes(targetCollection)) {
      return res.status(400).json({ error: 'Only "users" or "user" collections are supported for view' });
    }

    const users = await db.collection(targetCollection).find({}).limit(5).toArray();

    res.json({ success: true, message: `Data retrieved from ${targetDb}`, data: { users }, mcpFlow: true });

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

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP Server running on http://localhost:${PORT}`);
  console.log(`Persistence file: ${PERSISTENCE_FILE}`);
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
