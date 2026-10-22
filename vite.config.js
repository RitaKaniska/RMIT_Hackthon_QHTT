import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const DENIED_DEV_PATHS = [
  /^\/(?:tidecloak|adapter)\.json$/i,
  /^\/public\/tidecloak\.json$/i,
  /^\/(?:config|data|tidecloak-data)\//i,
  /^\/(?:\.env(?:\.|$))/i,
  /\.(?:sqlite3?|db|log)$/i,
];

function denyRuntimeAssets() {
  let outDir = resolve("dist");
  return {
    name: "embargo-deny-runtime-assets",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = String(req.url || "").split("?")[0];
        if (DENIED_DEV_PATHS.some((pattern) => pattern.test(pathname))) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found" } }));
          return;
        }
        next();
      });
    },
    closeBundle() {
      for (const relative of [
        "tidecloak.json",
        "adapter.json",
        "config/tidecloak.json",
        "config/adapter.json",
      ]) {
        try {
          rmSync(resolve(outDir, relative), { force: true });
        } catch {
          // Build output cleanup is best effort; the static server also denies these names.
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), denyRuntimeAssets()],
  server: {
    host: "localhost",
    port: 5137,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: false,
      },
    },
  },
});
