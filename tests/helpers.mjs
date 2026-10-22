import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createApp } from "../server/app.mjs";
import { createTokenVerifier } from "../server/auth.mjs";
import { openRepository } from "../server/repository.mjs";
import { Models } from "../server/tide-sdk.mjs";

export const REALM_ISSUER = "http://localhost:8080/realms/embargo-test";
export const CLIENT_ID = "embargo-web";
export const AUDIENCE = "embargo-api";
export const APP_ORIGIN = "http://localhost:5137";
export const VENDOR_ID = "vendor-123";

export async function makeKeys(kid = "test-key-1") {
  const { publicKey, privateKey } = await generateKeyPair("Ed25519", { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  return {
    publicKey,
    privateKey,
    publicJwk,
    publicJwks: { keys: [{ ...publicJwk, kid, alg: "EdDSA", use: "sig" }] },
  };
}

export function makeConfig(publicJwks) {
  const adapter = {
    realm: "embargo-test",
    authServerUrl: "http://localhost:8080",
    resource: CLIENT_ID,
    vendorId: VENDOR_ID,
    homeOrkUrl: "http://localhost:8080",
    jwk: publicJwks,
    originAuth: "test-origin-auth",
  };
  return {
    configured: true,
    checks: [{ id: "adapter", label: "TideCloak adapter", status: "ready", detail: "test" }],
    appOrigin: APP_ORIGIN,
    apiAudience: AUDIENCE,
    realmIssuer: REALM_ISSUER,
    adapter,
    publicAdapter: {
      realm: adapter.realm,
      "auth-server-url": adapter.authServerUrl,
      resource: adapter.resource,
      vendorId: adapter.vendorId,
      homeOrkUrl: adapter.homeOrkUrl,
      ["client-origin-auth-" + APP_ORIGIN]: adapter.originAuth,
      jwk: publicJwks,
    },
    adapterPath: "/test/tidecloak.json",
    cspOrigins: [],
  };
}

export async function makeToken(privateKey, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    azp: CLIENT_ID,
    realm_access: { roles: ["researcher"] },
    ...overrides.payload,
  };
  let jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: "EdDSA", ...(overrides.kid ? { kid: overrides.kid } : {}) })
    .setIssuedAt(overrides.iat || now)
    .setExpirationTime(overrides.exp || now + 300)
    .setJti(overrides.jti || "jti-" + Math.random().toString(16).slice(2));
  if (!overrides.omitIss) jwt = jwt.setIssuer(overrides.iss || REALM_ISSUER);
  if (!overrides.omitAud) jwt = jwt.setAudience(overrides.aud || AUDIENCE);
  if (!overrides.omitSub) jwt = jwt.setSubject(overrides.sub === undefined ? "user-1" : overrides.sub);
  return jwt.sign(privateKey);
}

export async function startTestServer(t, options = {}) {
  const keys = options.keys || (await makeKeys());
  const dir = mkdtempSync(join(tmpdir(), "embargo-test-"));
  const dbPath = join(dir, "test.sqlite");
  const repository = openRepository(dbPath);
  const config = options.config || makeConfig(keys.publicJwks);
  const verifier =
    options.verifier ||
    (config.configured
      ? createTokenVerifier({
          jwk: config.adapter.jwk,
          issuer: config.realmIssuer,
          audience: config.apiAudience,
          clientId: config.adapter.resource,
        })
      : null);
  const app = createApp({
    config,
    repository,
    verifier,
    fetchImpl: options.fetchImpl,
    distDir: null,
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { base, repository, config, keys, dbPath };
}

export async function request(base, path, options = {}) {
  const headers = { Accept: "application/json", ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.origin) headers.Origin = options.origin;
  let body;
  if (options.body !== undefined) {
    body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
  }
  const response = await fetch(base + path, {
    method: options.method || (body !== undefined ? "POST" : "GET"),
    headers,
    body,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Text responses are expected for some static/error cases.
  }
  return { status: response.status, headers: response.headers, text, json };
}

export function errorCode(response) {
  return response.json?.error?.code;
}

// Opaque synthetic bytes for structural storage tests. This is NOT a Tide
// signature and must never be described as one.
export function signedPolicyBase64(options) {
  const { kind, context, vendorId } = options;
  const params = new Map([
    ["subjectType", options.subjectType || (kind === "write" ? "User" : "Role")],
    [
      "subjectId",
      options.subjectId ||
        (kind === "write"
          ? context.writerKey
          : context.vendorId === "kettle"
            ? "vendor-kettle"
            : "vendor-acme"),
    ],
    ["assignmentId", options.assignmentId || context.assignmentId],
    ["roles", JSON.stringify(options.roles || [kind === "write" ? "_tide_encryptor" : "_tide_decryptor"])],
  ]);
  if (options.clientId !== undefined) params.set("clientId", options.clientId);
  if (options.extraParam) params.set(options.extraParam[0], options.extraParam[1]);
  const policy = new Models.Policy({
    version: Models.Policy.latestVersion,
    contractId: options.contractId || "RelationshipAttestation:1",
    modelId: options.modelId || ["PolicyEnabledEncryption:1", "PolicyEnabledDecryption:1"],
    keyId: options.keyId || vendorId,
    approvalType: options.approvalType ?? Models.ApprovalType.IMPLICIT,
    executionType: options.executionType ?? Models.ExecutionType.PRIVATE,
    params,
    ...(options.expiry !== undefined ? { expiry: options.expiry } : {}),
  });
  if (options.signature !== null) {
    policy.signature = options.signature || new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
  }
  return Buffer.from(policy.toBytes()).toString("base64");
}
