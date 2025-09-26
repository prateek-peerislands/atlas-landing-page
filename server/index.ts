import express, { type Request, Response, NextFunction } from "express";
import fs from 'fs';
import path from 'path';
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  console.log("Initializing server...");
  
  // Note: MCP server should be started separately to avoid port conflicts
  // Run: node mcp-server.cjs in a separate terminal
  
  // Simple health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', message: 'Frontend server running' });
  });

  // MCP server start endpoint
  app.post('/api/start-mcp', (req, res) => {
    // MCP server is already started as child process, just confirm it's ready
    res.json({ 
      success: true, 
      message: 'MCP server is running',
      port: 3001 
    });
  });

  // Validation endpoint (read-only planning)
  app.post('/api/agent/validate', async (req, res) => {
    try {
      const { postgresUrl, mongoUri, instruction } = req.body || {};
      if (!postgresUrl || !mongoUri) {
        return res.status(400).json({ message: 'postgresUrl and mongoUri are required' });
      }

      const { spawn } = await import('child_process');
      const agentCwd = path.join(process.cwd(), 'agent');
      const builtEntry = path.join(agentCwd, 'dist', 'index.js');
      const useBuilt = fs.existsSync(builtEntry);
      // Load agent/.env manually and pass to child env
      let agentEnv: Record<string, string> = {};
      try {
        const dotenv = await import('dotenv');
        const parsed = dotenv.config({ path: path.join(agentCwd, '.env') }).parsed || {} as Record<string, string>;
        agentEnv = parsed;
      } catch {}
      const command = useBuilt ? 'node' : 'npx';
      const args = useBuilt ? ['-r', 'dotenv/config', 'dist/index.js', instruction || 'Generate migration validation report'] : ['--yes', 'tsx', 'src/index.ts', instruction || 'Generate migration validation report'];
      const child = spawn(command, args, {
        cwd: agentCwd,
        env: { ...process.env, ...agentEnv, POSTGRES_URL: postgresUrl, MONGODB_URI: mongoUri, AGENT_MODE: 'validate', DOTENV_CONFIG_PATH: path.join(agentCwd, '.env') },
      });

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => (stdout += d.toString()));
      child.stderr?.on('data', (d) => (stderr += d.toString()));

      child.on('close', (code) => {
        if (code === 0) {
          try {
            const json = JSON.parse(stdout.trim());
            return res.json(json);
          } catch {
            return res.json({ ok: true, raw: stdout.trim() });
          }
        } else {
          res.status(500).json({ ok: false, error: stderr.trim() || 'Validate failed' });
        }
      });
    } catch (error: any) {
      console.error('Validate endpoint error:', error);
      res.status(500).json({ message: 'Validate error', error: error.message });
    }
  });

  // Agent endpoint: kicks off migration agent with provided connection strings and prompt
  app.post('/api/agent/migrate', async (req, res) => {
    try {
      const { postgresUrl, mongoUri, planId } = req.body || {};
      if (!postgresUrl || !mongoUri || !planId) {
        return res.status(400).json({ message: 'postgresUrl, mongoUri and planId are required' });
      }

      // Run the agent CLI as a child process with envs for the MCP servers
      const { spawn } = await import('child_process');
      const agentCwd = path.join(process.cwd(), 'agent');
      const builtEntry = path.join(agentCwd, 'dist', 'index.js');
      const useBuilt = fs.existsSync(builtEntry);
      // Load agent/.env manually and pass to child env
      let agentEnv: Record<string, string> = {};
      try {
        const dotenv = await import('dotenv');
        const parsed = dotenv.config({ path: path.join(agentCwd, '.env') }).parsed || {} as Record<string, string>;
        agentEnv = parsed;
      } catch {}
      const command = useBuilt ? 'node' : 'npx';
      const args = useBuilt ? ['-r', 'dotenv/config', 'dist/index.js', `Execute migration for plan ${planId}`] : ['--yes', 'tsx', 'src/index.ts', `Execute migration for plan ${planId}`];
      const child = spawn(command, args, {
        cwd: agentCwd,
        env: { ...process.env, ...agentEnv, POSTGRES_URL: postgresUrl, MONGODB_URI: mongoUri, AGENT_MODE: 'execute', AGENT_PLAN_ID: planId, DOTENV_CONFIG_PATH: path.join(agentCwd, '.env') },
      });

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => (stdout += d.toString()));
      child.stderr?.on('data', (d) => (stderr += d.toString()));

      child.on('close', (code) => {
        if (code === 0) {
          res.json({ ok: true, answer: stdout.trim() });
        } else {
          res.status(500).json({ ok: false, error: stderr.trim() || 'Agent failed' });
        }
      });
    } catch (error: any) {
      console.error('Agent endpoint error:', error);
      res.status(500).json({ message: 'Agent error', error: error.message });
    }
  });

  // Proxy endpoint for cluster creation to MCP server
  app.post('/api/create-cluster', async (req, res) => {
    try {
      const { clusterName, tier = 'M10' } = req.body;
      
      if (!clusterName) {
        return res.status(400).json({
          success: false,
          message: 'Cluster name is required'
        });
      }
      
      // Forward request to MCP server (region and provider are hardcoded)
      const mcpResponse = await fetch('http://localhost:3001/create-cluster', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clusterName: clusterName,
          tier: tier
        })
      });

      const result = await mcpResponse.json();
      res.json(result);
    } catch (error: any) {
      console.error('Proxy to MCP server failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to communicate with MCP server',
        error: error.message
      });
    }
  });

  // Proxy endpoint for cluster status to MCP server
  app.get('/api/cluster-status', async (req, res) => {
    try {
      const { id } = req.query;
      
      // Forward request to MCP server
      const mcpResponse = await fetch(`http://localhost:3001/api/cluster-status?id=${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (mcpResponse.status === 404) {
        // If MCP says not found, propagate 404 so UI can treat as deleted
        return res.status(404).json({ success: false, message: 'Request not found (deleted)' });
      }
      const result = await mcpResponse.json();
      res.json(result);
    } catch (error: any) {
      console.error('Proxy to MCP server failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to communicate with MCP server',
        error: error.message
      });
    }
  });

  // Proxy endpoint for populate data to MCP server
  app.post('/api/populate-data', async (req, res) => {
    try {
      const { clusterName, requestId, dbName, collectionName, connectionString } = req.body;
      
      // Forward request to MCP server
      const mcpResponse = await fetch('http://localhost:3001/api/populate-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ clusterName, requestId, dbName, collectionName, connectionString })
      });

      const result = await mcpResponse.json();
      res.json(result);
    } catch (error: any) {
      console.error('Proxy to MCP server failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to communicate with MCP server',
        error: error.message
      });
    }
  });

  // Proxy endpoint for view data to MCP server
  app.post('/api/view-data', async (req, res) => {
    try {
      const { clusterName, requestId, dbName, collectionName, connectionString } = req.body;
      
      // Forward request to MCP server
      const mcpResponse = await fetch('http://localhost:3001/api/view-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ clusterName, requestId, dbName, collectionName, connectionString })
      });

      const result = await mcpResponse.json();
      res.json(result);
    } catch (error: any) {
      console.error('Proxy to MCP server failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to communicate with MCP server',
        error: error.message
      });
    }
  });

  // Proxy endpoint to stop/terminate an in-progress cluster via MCP server
  app.post('/api/stop-cluster', async (req, res) => {
    try {
      const { requestId, comment, clusterName } = req.body || {};
      if (!requestId) {
        return res.status(400).json({
          success: false,
          message: 'requestId is required'
        });
      }

      console.log('[PROXY /api/stop-cluster] incoming', { requestId, clusterName, comment });
      const mcpResponse = await fetch('http://localhost:3001/api/stop-cluster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, comment, clusterName })
      });

      const result = await mcpResponse.json().catch(() => ({}));
      console.log('[PROXY /api/stop-cluster] MCP response', mcpResponse.status, result);
      if (!mcpResponse.ok) {
        return res.status(mcpResponse.status).json(result);
      }
      res.json(result);
    } catch (error: any) {
      console.error('Proxy stop-cluster failed:', error);
      res.status(500).json({ success: false, message: 'Failed to proxy stop-cluster', error: error.message });
    }
  });

  // Proxy endpoint to delete cluster by name (no requestId) via MCP server
  app.post('/api/delete-cluster-by-name', async (req, res) => {
    try {
      const { clusterName } = req.body || {};
      if (!clusterName) {
        return res.status(400).json({ success: false, message: 'clusterName is required' });
      }
      const mcpResponse = await fetch('http://localhost:3001/api/delete-cluster-by-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterName })
      });
      const result = await mcpResponse.json().catch(() => ({}));
      if (!mcpResponse.ok) {
        return res.status(mcpResponse.status).json(result);
      }
      res.json(result);
    } catch (error: any) {
      console.error('Proxy delete-cluster-by-name failed:', error);
      res.status(500).json({ success: false, message: 'Failed to proxy delete-cluster-by-name', error: error.message });
    }
  });
  // Proxy endpoint to stop/terminate an in-progress cluster via MCP server
  app.post('/api/stop-cluster', async (req, res) => {
    try {
      const { requestId } = req.body || {};
      if (!requestId) {
        return res.status(400).json({
          success: false,
          message: 'requestId is required'
        });
      }

      // Forward request to MCP server
      const mcpResponse = await fetch('http://localhost:3001/api/stop-cluster', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requestId })
      });

      const result = await mcpResponse.json();
      res.json(result);
    } catch (error: any) {
      console.error('Proxy to MCP server failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to communicate with MCP server',
        error: error.message
      });
    }
  });

  // AI-powered cluster tier suggestion endpoint
  app.post('/api/suggest-cluster-tier', async (req, res) => {
    try {
      const { requirements } = req.body;
      
      if (!requirements) {
        return res.status(400).json({ 
          success: false, 
          message: 'Requirements are required' 
        });
      }

      // Import the AI agent function
      const { suggestClusterTier } = await import('../agent/dist/index.js');
      
      // Get AI suggestion
      const suggestion = await suggestClusterTier(requirements);
      
      res.json({
        success: true,
        suggestion
      });
    } catch (error: any) {
      console.error('Cluster tier suggestion error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate cluster tier suggestion',
        error: error.message
      });
    }
  });

  const server = await import('http').then(http => http.createServer(app));

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '9001', 10);
  server.listen({
    port,
    host: "localhost",
  }, () => {
    log(`serving on port ${port}`);
  });
})();
