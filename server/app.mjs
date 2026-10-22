import { randomUUID } from "node:crypto";
import { createTokenVerifier, extractBearerToken, isAdminPayload, requestHasAllowedOrigin, rolesFromPayload } from "./auth.mjs";
import { ApiError } from "./errors.mjs";
import { readJsonBody, sendError, sendJson } from "./http.mjs";
import {
  fetchReservedAdminPolicy,
  validateCiphertext,
  validateEncodedRequest,
  validateSignedRelationshipPolicy,
} from "./policies.mjs";
import { createStaticHandler } from "./static.mjs";
import { DOMAIN, STATUSES, VENDORS } from "../shared/contracts.mjs";
import { assertExactKeys, isUuid, validateVendorId } from "../shared/validation.mjs";

const VENDOR_BY_ID = new Map(VENDORS.map((vendor) => [vendor.id, vendor]));

function allowMethod(req, res, methods) {
  if (methods.includes(req.method)) return;
  res.setHeader("Allow", methods.join(", "));
  throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
}

async function exactBody(req, keys) {
  const body = await readJsonBody(req);
  try {
    assertExactKeys(body, keys, "request body");
  } catch {
    throw new ApiError(400, "INVALID_BODY", "Request body fields are invalid");
  }
  return body;
}

function requireVersion(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new ApiError(400, "INVALID_VERSION", "expectedVersion must be a positive integer");
  }
  return value;
}

function requireVendor(value) {
  if (!validateVendorId(value)) throw new ApiError(400, "INVALID_VENDOR", "Unknown vendor");
  return VENDOR_BY_ID.get(value);
}

function requireRole(identity, role) {
  if (!identity.realmRoles.includes(role)) throw new ApiError(403, "FORBIDDEN", "Role is not permitted");
}

function requireAdmin(identity) {
  if (!identity.admin) throw new ApiError(403, "FORBIDDEN", "Realm administrator role is required");
}

function pathId(raw) {
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw new ApiError(400, "INVALID_ID", "Assignment id is not valid");
  }
  if (!isUuid(decoded)) throw new ApiError(400, "INVALID_ID", "Assignment id must be a full UUID");
  return decoded;
}

function hideRequests(draft) {
  return { ...draft, writeRequest: null, readRequest: null };
}

function noQuery(url) {
  if ([...url.searchParams.keys()].length > 0) {
    throw new ApiError(400, "INVALID_QUERY", "This route does not accept query parameters");
  }
}

function sendPlain(req, res, status, text, headers = {}) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  const body = Buffer.from(text, "utf8");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Length", String(body.byteLength));
  if (req.method === "HEAD") res.end();
  else res.end(body);
}

export function createApp({ config, repository, verifier, fetchImpl = globalThis.fetch, distDir = null, clock = () => Date.now() }) {
  let tokenVerifier = verifier || null;
  if (!tokenVerifier && config.configured) {
    try {
      tokenVerifier = createTokenVerifier({
        jwk: config.adapter.jwk,
        issuer: config.realmIssuer,
        audience: config.apiAudience,
        clientId: config.adapter.resource,
      });
    } catch {
      tokenVerifier = null;
    }
  }
  const serveStatic = distDir ? createStaticHandler({ distDir, config }) : null;

  async function authenticate(req) {
    if (!tokenVerifier) throw new ApiError(503, "CONFIG_MISSING", "TideCloak is not configured");
    const token = extractBearerToken(req);
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "A bearer access token is required");
    let payload;
    try {
      payload = await tokenVerifier(token);
    } catch {
      throw new ApiError(401, "UNAUTHORIZED", "The bearer access token is not valid");
    }
    const { realmRoles } = rolesFromPayload(payload);
    return {
      token,
      payload,
      iss: payload.iss,
      sub: payload.sub,
      realmRoles,
      admin: isAdminPayload(payload),
    };
  }

  function draftInThisRealm(draft) {
    return draft && draft.context.realm === config.realmIssuer;
  }

  function actor(identity) {
    return { iss: identity.iss, sub: identity.sub };
  }

  async function handle(req, res) {
    let url;
    try {
      url = new URL(req.url || "/", "http://localhost");
    } catch {
      throw new ApiError(400, "INVALID_URL", "Request URL is invalid");
    }
    const pathname = url.pathname;

    if (!pathname.startsWith("/api/") && pathname !== "/api") {
      if (serveStatic) return serveStatic(req, res, url);
      sendPlain(req, res, 404, "Not found");
      return;
    }

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("Allow", "GET, HEAD, POST, PUT, PATCH, OPTIONS");
      res.setHeader("Cache-Control", "no-store");
      res.end();
      return;
    }

    if (pathname === "/api/health") {
      allowMethod(req, res, ["GET", "HEAD"]);
      try {
        repository.check();
      } catch {
        throw new ApiError(503, "DATABASE_UNAVAILABLE", "Database is not ready");
      }
      sendJson(req, res, 200, { status: "ok", database: "ready" });
      return;
    }

    if (pathname === "/api/setup") {
      allowMethod(req, res, ["GET", "HEAD"]);
      const payload = {
        configured: config.configured,
        checks: config.checks,
        appOrigin: config.appOrigin,
        apiAudience: config.apiAudience,
        realmIssuer: config.realmIssuer,
      };
      if (config.configured) payload.config = config.publicAdapter;
      sendJson(req, res, 200, payload);
      return;
    }

    if (!config.configured) {
      throw new ApiError(503, "CONFIG_MISSING", "TideCloak configuration is missing or invalid");
    }

    if (!["GET", "HEAD"].includes(req.method) && !requestHasAllowedOrigin(req, config.appOrigin)) {
      throw new ApiError(403, "ORIGIN_FORBIDDEN", "Browser writes must originate from the configured app origin");
    }

    if (pathname === "/api/drafts") {
      noQuery(url);
      if (req.method === "POST") {
        const identity = await authenticate(req);
        requireRole(identity, "researcher");
        const writerKey = identity.payload.tideuserkey;
        if (typeof writerKey !== "string" || writerKey.length === 0 || writerKey.length > 8192) {
          throw new ApiError(403, "TIDEUSERKEY_REQUIRED", "A verified tideuserkey claim is required");
        }
        const body = await exactBody(req, ["vendorId"]);
        requireVendor(body.vendorId);
        const context = {
          domain: DOMAIN,
          realm: config.realmIssuer,
          reportId: randomUUID(),
          revision: 1,
          assignmentId: randomUUID(),
          vendorId: body.vendorId,
          ownerIss: identity.iss,
          ownerSub: identity.sub,
          writerKey,
        };
        const draft = repository.createDraft({ context, actor: actor(identity) });
        sendJson(req, res, 201, { draft: hideRequests(draft) });
        return;
      }
      if (req.method === "GET" || req.method === "HEAD") {
        const identity = await authenticate(req);
        if (identity.admin) {
          sendJson(req, res, 200, { drafts: repository.listDraftsForRealm(config.realmIssuer) });
          return;
        }
        requireRole(identity, "researcher");
        sendJson(req, res, 200, {
          drafts: repository.listDraftsForOwner(config.realmIssuer, identity.iss, identity.sub),
        });
        return;
      }
      res.setHeader("Allow", "GET, HEAD, POST");
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    }

    const policyMatch = /^\/api\/drafts\/([^/]+)\/policies$/.exec(pathname);
    if (policyMatch) {
      allowMethod(req, res, ["PUT"]);
      noQuery(url);
      const identity = await authenticate(req);
      requireAdmin(identity);
      const assignmentId = pathId(policyMatch[1]);
      const body = await exactBody(req, ["kind", "policy", "expectedVersion"]);
      if (body.kind !== "write" && body.kind !== "read") {
        throw new ApiError(400, "INVALID_KIND", "kind must be write or read");
      }
      const expectedVersion = requireVersion(body.expectedVersion);
      const draft = repository.getDraft(assignmentId);
      if (!draftInThisRealm(draft)) throw new ApiError(404, "NOT_FOUND", "Draft not found");
      validateSignedRelationshipPolicy(body.policy, {
        kind: body.kind,
        context: draft.context,
        vendorId: config.adapter.vendorId,
        now: clock(),
      });
      const updated = repository.updateDraftPolicy({
        assignmentId,
        realm: config.realmIssuer,
        kind: body.kind,
        policy: body.policy,
        expectedVersion,
        actor: actor(identity),
      });
      sendJson(req, res, 200, { draft: updated }, { "X-Embargo-Policy-Check": "structural-only" });
      return;
    }

    const requestMatch = /^\/api\/drafts\/([^/]+)\/requests$/.exec(pathname);
    if (requestMatch) {
      allowMethod(req, res, ["PUT"]);
      noQuery(url);
      const identity = await authenticate(req);
      requireAdmin(identity);
      const assignmentId = pathId(requestMatch[1]);
      const body = await exactBody(req, ["kind", "request", "expectedVersion"]);
      if (body.kind !== "write" && body.kind !== "read") {
        throw new ApiError(400, "INVALID_KIND", "kind must be write or read");
      }
      const expectedVersion = requireVersion(body.expectedVersion);
      if (body.request !== null) validateEncodedRequest(body.request);
      const draft = repository.getDraft(assignmentId);
      if (!draftInThisRealm(draft)) throw new ApiError(404, "NOT_FOUND", "Draft not found");
      const updated = repository.updateDraftRequest({
        assignmentId,
        realm: config.realmIssuer,
        kind: body.kind,
        request: body.request,
        expectedVersion,
        actor: actor(identity),
      });
      sendJson(req, res, 200, { draft: updated });
      return;
    }

    const draftMatch = /^\/api\/drafts\/([^/]+)$/.exec(pathname);
    if (draftMatch) {
      allowMethod(req, res, ["GET", "HEAD"]);
      noQuery(url);
      const identity = await authenticate(req);
      const assignmentId = pathId(draftMatch[1]);
      const draft = repository.getDraft(assignmentId);
      if (!draftInThisRealm(draft)) throw new ApiError(404, "NOT_FOUND", "Draft not found");
      if (identity.admin) {
        sendJson(req, res, 200, { draft });
        return;
      }
      const owner = draft.context.ownerIss === identity.iss && draft.context.ownerSub === identity.sub;
      if (!owner) throw new ApiError(403, "FORBIDDEN", "Only the owner or an administrator may read this draft");
      sendJson(req, res, 200, { draft: hideRequests(draft) });
      return;
    }

    if (pathname === "/api/admin/policy") {
      allowMethod(req, res, ["GET", "HEAD"]);
      noQuery(url);
      const identity = await authenticate(req);
      requireAdmin(identity);
      const policy = await fetchReservedAdminPolicy({
        adapter: config.adapter,
        token: identity.token,
        fetchImpl,
      });
      sendJson(req, res, 200, { policy });
      return;
    }

    if (pathname === "/api/reports/mine") {
      allowMethod(req, res, ["GET", "HEAD"]);
      noQuery(url);
      const identity = await authenticate(req);
      sendJson(req, res, 200, {
        reports: repository.listReportMetadataForOwner(config.realmIssuer, identity.iss, identity.sub),
      });
      return;
    }

    if (pathname === "/api/reports") {
      if (req.method === "POST") {
        noQuery(url);
        const identity = await authenticate(req);
        requireRole(identity, "researcher");
        const body = await exactBody(req, ["assignmentId", "ciphertext"]);
        if (!isUuid(body.assignmentId)) throw new ApiError(400, "INVALID_ID", "assignmentId must be a full UUID");
        validateCiphertext(body.ciphertext);
        const draft = repository.getDraft(body.assignmentId);
        if (!draftInThisRealm(draft)) throw new ApiError(404, "NOT_FOUND", "Draft not found");
        if (draft.context.ownerIss !== identity.iss || draft.context.ownerSub !== identity.sub) {
          throw new ApiError(403, "FORBIDDEN", "Only the draft owner may submit this report");
        }
        if (!draft.writePolicy || !draft.readPolicy) {
          throw new ApiError(409, "POLICY_MISSING", "Both signed relationship policies are required");
        }
        try {
          validateSignedRelationshipPolicy(draft.writePolicy, {
            kind: "write",
            context: draft.context,
            vendorId: config.adapter.vendorId,
            now: clock(),
          });
          validateSignedRelationshipPolicy(draft.readPolicy, {
            kind: "read",
            context: draft.context,
            vendorId: config.adapter.vendorId,
            now: clock(),
          });
        } catch (error) {
          if (error instanceof ApiError) throw new ApiError(409, "POLICY_INVALID", error.message);
          throw error;
        }
        const report = repository.submitReport({
          assignmentId: body.assignmentId,
          realm: config.realmIssuer,
          ownerIss: identity.iss,
          ownerSub: identity.sub,
          ciphertext: body.ciphertext,
          actor: actor(identity),
        });
        sendJson(req, res, 201, { report });
        return;
      }
      if (req.method === "GET" || req.method === "HEAD") {
        const identity = await authenticate(req);
        const vendors = url.searchParams.getAll("vendorId");
        if (vendors.length !== 1 || [...url.searchParams.keys()].length !== 1) {
          throw new ApiError(400, "INVALID_QUERY", "Exactly one vendorId query parameter is required");
        }
        const vendor = requireVendor(vendors[0]);
        requireRole(identity, vendor.role);
        sendJson(req, res, 200, {
          reports: repository.listReportsForVendor(config.realmIssuer, vendor.id),
        });
        return;
      }
      res.setHeader("Allow", "GET, HEAD, POST");
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    }

    const reportMatch = /^\/api\/reports\/([^/]+)$/.exec(pathname);
    if (reportMatch) {
      allowMethod(req, res, ["PATCH"]);
      noQuery(url);
      const identity = await authenticate(req);
      const assignmentId = pathId(reportMatch[1]);
      const body = await exactBody(req, ["status", "expectedVersion"]);
      if (!STATUSES.includes(body.status)) throw new ApiError(400, "INVALID_STATUS", "Unknown status");
      const expectedVersion = requireVersion(body.expectedVersion);
      const report = repository.getReport(assignmentId, config.realmIssuer);
      if (!report) throw new ApiError(404, "NOT_FOUND", "Report not found");
      const vendor = requireVendor(report.context.vendorId);
      requireRole(identity, vendor.role);
      const updated = repository.updateReportStatus({
        assignmentId,
        realm: config.realmIssuer,
        status: body.status,
        expectedVersion,
        actor: actor(identity),
      });
      sendJson(req, res, 200, { report: updated });
      return;
    }

    if (pathname === "/api/operator/raw") {
      allowMethod(req, res, ["GET", "HEAD"]);
      noQuery(url);
      const identity = await authenticate(req);
      requireRole(identity, "operator");
      sendJson(req, res, 200, {
        reports: repository.listRawReports(config.realmIssuer),
        activity: repository.listActivity(config.realmIssuer),
      });
      return;
    }

    throw new ApiError(404, "NOT_FOUND", "Route not found");
  }

  return async function app(req, res) {
    try {
      await handle(req, res);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (error instanceof ApiError) {
        sendError(req, res, error);
        return;
      }
      console.error("[embargo-api] internal error", error && error.name ? error.name : "Error");
      sendError(req, res, new ApiError(500, "INTERNAL", "Internal server error"));
    }
  };
}
