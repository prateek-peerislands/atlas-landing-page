// server/index.ts
import express2 from "express";

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
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
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
  app.post("/api/create-cluster", async (req, res) => {
    try {
      const { clusterName } = req.body;
      const mcpResponse = await fetch("http://localhost:3001/create-cluster", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clusterName,
          cloudProvider: "AWS",
          region: "US_EAST_1",
          tier: "M10"
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
