import { ApiError } from "./errors.mjs";

export const MAX_BODY_BYTES = 1024 * 1024;

export function applyApiHeaders(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader("Vary", "Origin");
}

export function sendJson(req, res, status, payload, extraHeaders = {}) {
  applyApiHeaders(res);
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", String(body.byteLength));
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(body);
}

export function sendError(req, res, error) {
  const status = error instanceof ApiError ? error.status : 500;
  const code = error instanceof ApiError ? error.code : "INTERNAL";
  const message = error instanceof ApiError ? error.message : "Internal server error";
  const headers = status === 401 ? { "WWW-Authenticate": "Bearer" } : {};
  if (status === 413) headers.Connection = "close";
  sendJson(req, res, status, { error: { code, message } }, headers);
}

function contentTypeIsJson(value) {
  if (typeof value !== "string") return false;
  const [type, ...params] = value.split(";").map((part) => part.trim());
  if (type.toLowerCase() !== "application/json") return false;
  for (const param of params) {
    if (!param) continue;
    const [name, rawValue] = param.split("=").map((part) => part.trim());
    if (name.toLowerCase() !== "charset" || !rawValue) return false;
    if (rawValue.replace(/^"|"$/g, "").toLowerCase() !== "utf-8") return false;
  }
  return true;
}

export async function readJsonBody(req, limit = MAX_BODY_BYTES) {
  if (!contentTypeIsJson(req.headers["content-type"])) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  }
  const encoding = req.headers["content-encoding"];
  if (encoding !== undefined && encoding !== "identity") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Compressed request bodies are not accepted");
  }
  const declared = req.headers["content-length"];
  if (declared !== undefined) {
    if (!/^\d+$/.test(declared)) throw new ApiError(400, "INVALID_LENGTH", "Content-Length is invalid");
    if (Number(declared) > limit) {
      req.resume();
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", `Request body exceeds ${limit} bytes`);
    }
  }

  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of req) {
      total += chunk.length;
      if (total > limit) {
        req.resume();
        throw new ApiError(413, "PAYLOAD_TOO_LARGE", `Request body exceeds ${limit} bytes`);
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_BODY", "Request body could not be read");
  }
  if (total === 0) throw new ApiError(400, "INVALID_BODY", "Request body is required");
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body is not valid JSON");
  }
}
