import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { extname, resolve, sep } from "node:path";

const MIME = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
});

const DENIED_PARTS = [
  "tidecloak-data",
  ".env",
  ".sqlite",
  ".db",
  ".log",
  "id_rsa",
  "id_ed25519",
  "tidecloak.json",
  "adapter.json",
];

function safeDecodedPath(pathname) {
  if (/%2f|%5c/i.test(pathname)) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const segments = decoded.split("/").filter((part) => part.length > 0);
  if (segments.some((part) => part === "." || part === ".." || part.startsWith("."))) return null;
  const lower = decoded.toLowerCase();
  if (DENIED_PARTS.some((part) => lower.includes(part))) return null;
  return segments.join("/");
}

function cspFor(config) {
  const origins = [...(config?.cspOrigins || [])];
  for (const value of [config?.adapter?.authServerUrl, config?.adapter?.homeOrkUrl]) {
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") {
        origins.push(url.origin);
        origins.push(url.origin.replace(/^http/, "ws"));
      }
    } catch {
      // Ignore an unconfigured or malformed upstream URL.
    }
  }
  const upstream = [...new Set(origins)].join(" ");
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `form-action 'self'${upstream ? ` ${upstream}` : ""}`,
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${upstream ? ` ${upstream}` : ""}`,
    `frame-src 'self'${upstream ? ` ${upstream}` : ""}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}

function silentSsoCsp(html) {
  const hashes = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(match[1])) continue;
    hashes.push(`'sha256-${createHash("sha256").update(match[2]).digest("base64")}'`);
  }
  return [
    "default-src 'none'",
    `script-src 'self'${hashes.length ? ` ${hashes.join(" ")}` : ""}`,
    "frame-ancestors 'self'",
    "base-uri 'none'",
  ].join("; ");
}

function applyStaticHeaders(res, pathname, isHtml, config, silentCsp) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (silentCsp) {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Content-Security-Policy", silentCsp);
    res.setHeader("Cache-Control", "no-store");
    return;
  }
  res.setHeader("X-Frame-Options", "DENY");
  if (isHtml) {
    res.setHeader("Content-Security-Policy", cspFor(config));
    res.setHeader("Cache-Control", "no-store");
  } else if (pathname.startsWith("/assets/")) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
}

function sendNotFound(req, res, json) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  if (json) {
    const body = Buffer.from(JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found" } }), "utf8");
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Length", String(body.byteLength));
    if (req.method === "HEAD") res.end();
    else res.end(body);
    return;
  }
  const body = Buffer.from("Not found", "utf8");
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Length", String(body.byteLength));
  if (req.method === "HEAD") res.end();
  else res.end(body);
}

function fileFor(root, realRoot, relative) {
  const candidate = resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  if (!existsSync(candidate)) return null;
  let real;
  try {
    real = realpathSync(candidate);
  } catch {
    return null;
  }
  if (real !== realRoot && !real.startsWith(realRoot + sep)) return null;
  const stat = statSync(real);
  if (!stat.isFile()) return null;
  return { path: real, stat };
}

function streamFile(req, res, file) {
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(file.path);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end();
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

export function createStaticHandler({ distDir, config }) {
  const root = resolve(distDir);
  const indexPath = resolve(root, "index.html");
  const silentPath = resolve(root, "silent-check-sso.html");
  const hasBuild = existsSync(indexPath);
  let realRoot = null;
  if (hasBuild) {
    try {
      realRoot = realpathSync(root);
    } catch {
      realRoot = null;
    }
  }
  let silentCsp = null;
  if (existsSync(silentPath)) {
    try {
      silentCsp = silentSsoCsp(readFileSync(silentPath, "utf8"));
    } catch {
      silentCsp = "default-src 'none'; script-src 'self'; frame-ancestors 'self'; base-uri 'none'";
    }
  }

  return async function serveStatic(req, res, url) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return;
    }
    if (!realRoot) {
      sendNotFound(req, res, url.pathname.toLowerCase().endsWith(".json"));
      return;
    }

    const relative = safeDecodedPath(url.pathname);
    if (relative === null) {
      sendNotFound(req, res, true);
      return;
    }

    const requested = relative === "" ? "index.html" : relative;
    const found = fileFor(root, realRoot, requested);
    if (found) {
      const ext = extname(found.path).toLowerCase();
      const isHtml = ext === ".html";
      const isSilentSso = url.pathname === "/silent-check-sso.html";
      applyStaticHeaders(res, url.pathname, isHtml, config, isSilentSso ? silentCsp : null);
      res.statusCode = 200;
      res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
      res.setHeader("Content-Length", String(found.stat.size));
      streamFile(req, res, found);
      return;
    }

    const ext = extname(relative).toLowerCase();
    const accept = String(req.headers.accept || "");
    const spaCandidate =
      relative !== "" &&
      ext === "" &&
      !relative.startsWith("assets/") &&
      accept.includes("text/html");
    if (spaCandidate) {
      const index = fileFor(root, realRoot, "index.html");
      if (index) {
        applyStaticHeaders(res, url.pathname, true, config);
        res.statusCode = 200;
        res.setHeader("Content-Type", MIME[".html"]);
        res.setHeader("Content-Length", String(index.stat.size));
        streamFile(req, res, index);
        return;
      }
    }

    sendNotFound(req, res, ext === ".json" || url.pathname.toLowerCase().endsWith(".json"));
  };
}
