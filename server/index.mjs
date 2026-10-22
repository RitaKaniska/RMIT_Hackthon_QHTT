import http from "node:http";
import { resolve } from "node:path";
import { createApp } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { defaultDatabasePath, openRepository } from "./repository.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const host = process.env.EMBARGO_API_HOST || "127.0.0.1";
const port = Number(process.env.EMBARGO_API_PORT || 3001);

if (!LOOPBACK_HOSTS.has(host)) {
  console.error("[embargo-api] EMBARGO_API_HOST must be a loopback host");
  process.exit(1);
}
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error("[embargo-api] EMBARGO_API_PORT must be a valid port");
  process.exit(1);
}

const config = loadConfig(process.env);
const repository = openRepository(defaultDatabasePath(process.env));
const app = createApp({ config, repository, distDir: resolve("dist") });

const server = http.createServer(app);
server.requestTimeout = 30000;
server.headersTimeout = 20000;
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 100;
server.on("clientError", (_error, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

server.on("error", (error) => {
  console.error("[embargo-api] server error", error && error.code ? error.code : "unknown");
  try {
    repository.close();
  } catch {
    // Ignore a second close failure.
  }
  process.exit(1);
});

server.listen(port, host, () => {
  const address = server.address();
  const shown = typeof address === "object" && address ? `${address.address}:${address.port}` : `${host}:${port}`;
  console.log(`[embargo-api] listening on http://${shown} (configured=${config.configured})`);
});

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  server.close(() => {
    try {
      repository.close();
    } catch {
      // Ignore close failures during shutdown.
    }
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
  setTimeout(() => {
    try {
      repository.close();
    } catch {
      // Ignore.
    }
    process.exit(signal === "SIGINT" ? 130 : 143);
  }, 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
