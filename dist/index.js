var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// agent/dist/index.js
var dist_exports = {};
__export(dist_exports, {
  askMigrationAgent: () => askMigrationAgent,
  suggestClusterTier: () => suggestClusterTier
});
import "dotenv/config";
import OpenAI from "openai";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
async function connectMcp(command, args = [], env) {
  const client = new McpClient({ name: "agent-client", version: "0.1.0" }, { capabilities: { tools: {} } });
  await client.connect(new StdioClientTransport({ command, args, env: { ...process.env, ...env } }));
  return client;
}
async function listToolsForLlm(client) {
  const catalog = await client.listTools();
  return catalog.tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema || { type: "object" }
    }
  }));
}
async function suggestClusterTier(requirements) {
  const openai = new OpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
    defaultQuery: { "api-version": "2024-02-15-preview" },
    defaultHeaders: { "api-key": process.env.AZURE_OPENAI_API_KEY }
  });
  const systemPrompt = `You are an expert MongoDB Atlas cluster tier recommendation system. 
  Analyze the developer's requirements and suggest the optimal cluster tier based on:
  - Environment type (production/development/testing)
  - Data volume expectations
  - Concurrent user count
  - Query complexity
  - Performance requirements
  - Geographic region
  - Backup and security needs

  Available MongoDB Atlas cluster tiers (official specifications):
  - M0: Shared RAM, 512MB storage - Free (Learning and exploration)
  - M2: Shared RAM, 2GB storage - $9/month (Small development projects)
  - M5: Shared RAM, 5GB storage - $25/month (Small development projects)
  - M10: 2 vCPUs, 2GB RAM, 10GB storage - $57/month (Development, small apps)
  - M20: 2 vCPUs, 4GB RAM, 20GB storage - $147/month (Medium applications)
  - M30: 2 vCPUs, 8GB RAM, 40GB storage - $388/month (Production, high traffic)
  - M40: 4 vCPUs, 16GB RAM, 80GB storage - $747/month (Large applications)
  - M50: 8 vCPUs, 32GB RAM, 160GB storage - $1,437/month (High-performance)
  - M60: 16 vCPUs, 64GB RAM, 320GB storage - $2,847/month (Very high-performance)
  - M80: 32 vCPUs, 128GB RAM, 750GB storage - $5,258/month (Enterprise-level)
  - M140: 48 vCPUs, 192GB RAM, 1TB storage - $7,915/month (Large enterprise)
  - M200: 64 vCPUs, 256GB RAM, 1.5TB storage - $10,508/month (Very large enterprise)
  - M300: 96 vCPUs, 384GB RAM, 2TB storage - $15,735/month (Maximum enterprise)

  Respond with a JSON object containing:
  {
    "tier": "M20",
    "name": "Medium",
    "vcpus": 4,
    "ram": 8,
    "storage": "20 GB",
    "reasoning": ["Reason 1", "Reason 2", "Reason 3"],
    "confidence": 85,
    "estimatedCost": "$25/month",
    "features": ["Feature 1", "Feature 2", "Feature 3"]
  }`;
  const userPrompt = `Analyze these requirements and suggest the optimal MongoDB Atlas cluster tier:
  Environment: ${requirements.environment}
  Data Volume: ${requirements.dataVolume}
  Concurrent Users: ${requirements.concurrentUsers}
  Query Complexity: ${requirements.queryComplexity}
  Performance Requirements: ${requirements.performanceRequirements}
  Geographic Region: ${requirements.geographicRegion || "Not specified"}`;
  const response = await openai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.3
  });
  const content = response.choices[0].message.content;
  console.log("Azure OpenAI response content:", content);
  try {
    let jsonContent = content || "{}";
    if (jsonContent.includes("```json")) {
      const jsonMatch = jsonContent.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }
    }
    const parsed = JSON.parse(jsonContent);
    console.log("Parsed JSON:", parsed);
    return parsed;
  } catch (error) {
    console.log("JSON parsing error:", error);
    console.log("Raw content:", content);
    return {
      tier: "M20",
      name: "Medium",
      vcpus: 2,
      ram: 4,
      storage: "20 GB",
      reasoning: ["AI analysis completed but response format was unexpected"],
      confidence: 70,
      estimatedCost: "$146.72/month",
      features: ["Standard MongoDB Atlas features"]
    };
  }
}
async function askMigrationAgent(prompt) {
  const openai = new OpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
    defaultQuery: { "api-version": "2024-02-15-preview" },
    defaultHeaders: { "api-key": process.env.AZURE_OPENAI_API_KEY }
  });
  const mongodbUri = process.env.MONGODB_URI;
  const postgresUrl = process.env.POSTGRES_URL;
  if (!mongodbUri || !postgresUrl) {
    throw new Error("Missing MONGODB_URI or POSTGRES_URL");
  }
  const mongo = await connectMcp("node", ["dist/mcp/mongo-data-mcp-server.js"], { MONGODB_URI: mongodbUri });
  const pg = await connectMcp("node", ["dist/mcp/postgres-mcp-server.js"], { POSTGRES_URL: postgresUrl });
  const allMongoTools = await listToolsForLlm(mongo);
  const pgTools = await listToolsForLlm(pg);
  const mode = (process.env.AGENT_MODE || "execute").toLowerCase();
  const mongoReadOnlyTools = allMongoTools.filter((t) => {
    const name = t.function.name;
    return name === "mongo.list_collections" || name === "mongo.get_indexes";
  });
  const mongoWriteTools = allMongoTools.filter((t) => !mongoReadOnlyTools.some((r) => r.function.name === t.function.name));
  const tools = mode === "validate" ? [...pgTools, ...mongoReadOnlyTools] : [...pgTools, ...allMongoTools];
  const messages = [
    { role: "system", content: mode === "validate" ? "You are validating a PostgreSQL\u2192MongoDB migration. Use ONLY read-only tools. Fetch schema and suggest a mapping. Respond ONLY with a single JSON object with keys: summary, mapping[], transformRules, indexPlan[], risks[], dryRunSamples{}. Do not include prose." : "You are a migration agent that moves data from PostgreSQL to MongoDB via MCP tools. Never access databases directly; always use tools. Plan briefly, then execute." },
    { role: "user", content: prompt }
  ];
  for (let step = 0; step < 8; step++) {
    const res = await openai.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4o",
      messages,
      tools
    });
    const msg = res.choices[0].message;
    if (msg.tool_calls?.length) {
      for (const call of msg.tool_calls) {
        const name = call.function.name;
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        const client = name.startsWith("postgres.") ? pg : mongo;
        const output = await client.callTool({ name, arguments: args });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output) });
      }
      continue;
    }
    if (msg.content) {
      if (mode === "validate") {
        const fs3 = await import("fs");
        const path4 = await import("path");
        const planId = `val-${Date.now()}`;
        let report;
        try {
          report = JSON.parse(msg.content);
        } catch {
          report = { summary: msg.content };
        }
        report.planId = report.planId || planId;
        const dir = path4.join(process.cwd(), "reports");
        if (!fs3.existsSync(dir))
          fs3.mkdirSync(dir, { recursive: true });
        const filePath = path4.join(dir, `${report.planId}.json`);
        fs3.writeFileSync(filePath, JSON.stringify(report, null, 2));
        return JSON.stringify({ ok: true, planId: report.planId, report });
      }
      return msg.content;
    }
  }
  return "Unable to complete migration with available tools.";
}
var init_dist = __esm({
  "agent/dist/index.js"() {
    "use strict";
    if (process.argv[2]) {
      askMigrationAgent(process.argv.slice(2).join(" ")).then((out) => {
        console.log(out);
        process.exit(0);
      }).catch((e) => {
        console.error(e);
        process.exit(1);
      });
    }
  }
});

// server/index.ts
import express2 from "express";
import fs2 from "fs";
import path3 from "path";

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false
      },
      "/create-cluster": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false
      },
      "/health": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false
      }
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path4 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path4.startsWith("/api")) {
      let logLine = `${req.method} ${path4} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  console.log("Initializing server...");
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", message: "Frontend server running" });
  });
  app.post("/api/start-mcp", (req, res) => {
    res.json({
      success: true,
      message: "MCP server is running",
      port: 3001
    });
  });
  app.post("/api/agent/validate", async (req, res) => {
    try {
      const { postgresUrl, mongoUri, instruction } = req.body || {};
      if (!postgresUrl || !mongoUri) {
        return res.status(400).json({ message: "postgresUrl and mongoUri are required" });
      }
      const { spawn } = await import("child_process");
      const agentCwd = path3.join(process.cwd(), "agent");
      const builtEntry = path3.join(agentCwd, "dist", "index.js");
      const useBuilt = fs2.existsSync(builtEntry);
      let agentEnv = {};
      try {
        const dotenv = await import("dotenv");
        const parsed = dotenv.config({ path: path3.join(agentCwd, ".env") }).parsed || {};
        agentEnv = parsed;
      } catch {
      }
      const command = useBuilt ? "node" : "npx";
      const args = useBuilt ? ["-r", "dotenv/config", "dist/index.js", instruction || "Generate migration validation report"] : ["--yes", "tsx", "src/index.ts", instruction || "Generate migration validation report"];
      const child = spawn(command, args, {
        cwd: agentCwd,
        env: { ...process.env, ...agentEnv, POSTGRES_URL: postgresUrl, MONGODB_URI: mongoUri, AGENT_MODE: "validate", DOTENV_CONFIG_PATH: path3.join(agentCwd, ".env") }
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => stdout += d.toString());
      child.stderr?.on("data", (d) => stderr += d.toString());
      child.on("close", (code) => {
        if (code === 0) {
          try {
            const json = JSON.parse(stdout.trim());
            return res.json(json);
          } catch {
            return res.json({ ok: true, raw: stdout.trim() });
          }
        } else {
          res.status(500).json({ ok: false, error: stderr.trim() || "Validate failed" });
        }
      });
    } catch (error) {
      console.error("Validate endpoint error:", error);
      res.status(500).json({ message: "Validate error", error: error.message });
    }
  });
  app.post("/api/agent/migrate", async (req, res) => {
    try {
      const { postgresUrl, mongoUri, planId } = req.body || {};
      if (!postgresUrl || !mongoUri || !planId) {
        return res.status(400).json({ message: "postgresUrl, mongoUri and planId are required" });
      }
      const { spawn } = await import("child_process");
      const agentCwd = path3.join(process.cwd(), "agent");
      const builtEntry = path3.join(agentCwd, "dist", "index.js");
      const useBuilt = fs2.existsSync(builtEntry);
      let agentEnv = {};
      try {
        const dotenv = await import("dotenv");
        const parsed = dotenv.config({ path: path3.join(agentCwd, ".env") }).parsed || {};
        agentEnv = parsed;
      } catch {
      }
      const command = useBuilt ? "node" : "npx";
      const args = useBuilt ? ["-r", "dotenv/config", "dist/index.js", `Execute migration for plan ${planId}`] : ["--yes", "tsx", "src/index.ts", `Execute migration for plan ${planId}`];
      const child = spawn(command, args, {
        cwd: agentCwd,
        env: { ...process.env, ...agentEnv, POSTGRES_URL: postgresUrl, MONGODB_URI: mongoUri, AGENT_MODE: "execute", AGENT_PLAN_ID: planId, DOTENV_CONFIG_PATH: path3.join(agentCwd, ".env") }
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => stdout += d.toString());
      child.stderr?.on("data", (d) => stderr += d.toString());
      child.on("close", (code) => {
        if (code === 0) {
          res.json({ ok: true, answer: stdout.trim() });
        } else {
          res.status(500).json({ ok: false, error: stderr.trim() || "Agent failed" });
        }
      });
    } catch (error) {
      console.error("Agent endpoint error:", error);
      res.status(500).json({ message: "Agent error", error: error.message });
    }
  });
  app.post("/api/create-cluster", async (req, res) => {
    try {
      const { clusterName, tier = "M10", region = "US_EAST_1", cloudProvider = "AWS" } = req.body;
      if (!clusterName) {
        return res.status(400).json({
          success: false,
          message: "Cluster name is required"
        });
      }
      const mcpResponse = await fetch("http://localhost:3001/create-cluster", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clusterName,
          cloudProvider,
          region,
          tier
        })
      });
      const result = await mcpResponse.json();
      res.json(result);
    } catch (error) {
      console.error("Proxy to MCP server failed:", error);
      res.status(500).json({
        success: false,
        message: "Failed to communicate with MCP server",
        error: error.message
      });
    }
  });
  app.get("/api/cluster-status", async (req, res) => {
    try {
      const { id } = req.query;
      const mcpResponse = await fetch(`http://localhost:3001/api/cluster-status?id=${id}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      });
      const result = await mcpResponse.json();
      res.json(result);
    } catch (error) {
      console.error("Proxy to MCP server failed:", error);
      res.status(500).json({
        success: false,
        message: "Failed to communicate with MCP server",
        error: error.message
      });
    }
  });
  app.post("/api/populate-data", async (req, res) => {
    try {
      const { clusterName, requestId } = req.body;
      const mcpResponse = await fetch("http://localhost:3001/api/populate-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ clusterName, requestId })
      });
      const result = await mcpResponse.json();
      res.json(result);
    } catch (error) {
      console.error("Proxy to MCP server failed:", error);
      res.status(500).json({
        success: false,
        message: "Failed to communicate with MCP server",
        error: error.message
      });
    }
  });
  app.post("/api/view-data", async (req, res) => {
    try {
      const { clusterName, requestId } = req.body;
      const mcpResponse = await fetch("http://localhost:3001/api/view-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ clusterName, requestId })
      });
      const result = await mcpResponse.json();
      res.json(result);
    } catch (error) {
      console.error("Proxy to MCP server failed:", error);
      res.status(500).json({
        success: false,
        message: "Failed to communicate with MCP server",
        error: error.message
      });
    }
  });
  app.post("/api/suggest-cluster-tier", async (req, res) => {
    try {
      const { requirements } = req.body;
      if (!requirements) {
        return res.status(400).json({
          success: false,
          message: "Requirements are required"
        });
      }
      const { suggestClusterTier: suggestClusterTier2 } = await Promise.resolve().then(() => (init_dist(), dist_exports));
      const suggestion = await suggestClusterTier2(requirements);
      res.json({
        success: true,
        suggestion
      });
    } catch (error) {
      console.error("Cluster tier suggestion error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to generate cluster tier suggestion",
        error: error.message
      });
    }
  });
  const server = await import("http").then((http) => http.createServer(app));
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = parseInt(process.env.PORT || "9001", 10);
  server.listen({
    port,
    host: "localhost"
  }, () => {
    log(`serving on port ${port}`);
  });
})();
