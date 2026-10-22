import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isHttpUrl,
  jwkHasPrivateMaterial,
  jwksHasPrivateMaterial,
  normaliseOrigin,
  validatePublicJwks,
} from "../shared/validation.mjs";

const REQUIRED_STRING_FIELDS = [
  ["auth-server-url", "authServer", "Auth server URL"],
  ["realm", "realm", "Realm"],
  ["resource", "resource", "Client resource"],
  ["vendorId", "vendorId", "Vendor id"],
  ["homeOrkUrl", "homeOrkUrl", "Home ORK URL"],
];

const PRIVATE_TOP_LEVEL = [
  "client-secret",
  "client_secret",
  "clientSecret",
  "credentials",
  "password",
  "private",
  "privateKey",
  "private-key",
  "secret",
  "accessToken",
  "refreshToken",
];

// Public realm key material the Tide SDK needs to start a session with the
// ORKs. Without these the ORKs reject TidecloakSessionStartTokenSign.
const PUBLIC_TIDE_FIELDS = [
  "gVRKCertificate",
  "gVVK",
  "obfGVVK",
  "vvkId",
  "payerPublic",
  "orkUrl",
  "thresholdN",
  "thresholdT",
  "backgroundUrl",
  "logoUrl",
];

function pickPublicTideFields(adapter) {
  const picked = {};
  for (const key of PUBLIC_TIDE_FIELDS) {
    const value = adapter[key];
    if (typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) {
      picked[key] = value;
    }
  }
  return picked;
}

function check(id, label, status, detail = "") {
  return { id, label, status, detail };
}

function hasPrivateField(value, depth = 0) {
  if (depth > 8 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasPrivateField(item, depth + 1));
  if (jwkHasPrivateMaterial(value) || jwksHasPrivateMaterial(value)) return true;
  for (const [key, child] of Object.entries(value)) {
    if (PRIVATE_TOP_LEVEL.includes(key)) return true;
    if (hasPrivateField(child, depth + 1)) return true;
  }
  return false;
}

function issuerFor(authServerUrl, realm) {
  return `${String(authServerUrl).replace(/\/+$/, "")}/realms/${encodeURIComponent(realm)}`;
}

export function loadConfig(env = process.env) {
  const appOriginRaw = env.APP_ORIGIN || "http://localhost:5137";
  const apiAudience = env.EMBARGO_AUDIENCE || "embargo-api";
  const adapterPath = resolve(env.TIDE_ADAPTER_PATH || "config/tidecloak.json");
  const checks = [];
  const cspOrigins = [];
  const invalidCspOrigins = [];
  for (const raw of String(env.TIDE_CSP_ORIGINS || "").split(",")) {
    const value = raw.trim();
    if (!value) continue;
    try {
      cspOrigins.push(normaliseOrigin(value));
    } catch {
      invalidCspOrigins.push(value);
    }
  }
  checks.push(
    invalidCspOrigins.length === 0
      ? check("csp-origins", "Additional CSP origins", "ready", cspOrigins.join(" ") || "none")
      : check("csp-origins", "Additional CSP origins", "error", "TIDE_CSP_ORIGINS must be bare http(s) origins"),
  );

  let appOrigin = appOriginRaw;
  try {
    appOrigin = normaliseOrigin(appOriginRaw);
    checks.push(check("app-origin", "Application origin", "ready", appOrigin));
  } catch {
    checks.push(check("app-origin", "Application origin", "error", "APP_ORIGIN must be a bare http(s) origin"));
  }

  const audienceOk = typeof apiAudience === "string" && apiAudience.length > 0 && apiAudience.length <= 200;
  checks.push(
    audienceOk
      ? check("audience", "API audience", "ready", apiAudience)
      : check("audience", "API audience", "error", "EMBARGO_AUDIENCE must be a non-empty string"),
  );

  let adapter = null;
  let parseError = null;
  try {
    adapter = JSON.parse(readFileSync(adapterPath, "utf8"));
    if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) {
      adapter = null;
      parseError = "Adapter JSON must be an object";
    }
  } catch (error) {
    parseError = error && error.code === "ENOENT" ? "missing" : "unreadable";
  }

  if (!adapter) {
    const status = parseError === "missing" ? "missing" : "error";
    const detail =
      parseError === "missing"
        ? `No adapter at ${adapterPath}`
        : parseError === "unreadable"
          ? `Adapter at ${adapterPath} could not be read as JSON`
          : parseError;
    checks.push(check("adapter", "TideCloak adapter", status, detail));
    for (const [, id, label] of REQUIRED_STRING_FIELDS) {
      checks.push(check(id, label, "missing", "Adapter not loaded"));
    }
    checks.push(check("jwk", "Embedded JWK", "missing", "Adapter not loaded"));
    checks.push(check("origin-auth", "Origin auth", "missing", "Adapter not loaded"));
    return {
      configured: false,
      checks,
      appOrigin,
      apiAudience,
      realmIssuer: null,
      adapter: null,
      publicAdapter: null,
      adapterPath,
      cspOrigins,
    };
  }

  checks.push(check("adapter", "TideCloak adapter", "ready", adapterPath));

  const values = {};
  for (const [field, id, label] of REQUIRED_STRING_FIELDS) {
    const value = adapter[field];
    if (typeof value === "string" && value.length > 0) {
      values[field] = value;
      checks.push(check(id, label, "ready", field === "realm" ? value : "present"));
    } else {
      checks.push(check(id, label, "missing", `Adapter field "${field}" is missing`));
    }
  }

  const authServerOk = isHttpUrl(values["auth-server-url"]);
  const homeOrkOk = isHttpUrl(values.homeOrkUrl);
  if (values["auth-server-url"] && !authServerOk) {
    checks.push(check("authServerUrl", "Auth server URL", "error", "auth-server-url must be an http(s) URL"));
  }
  if (values.homeOrkUrl && !homeOrkOk) {
    checks.push(check("homeOrkUrl", "Home ORK URL", "error", "homeOrkUrl must be an http(s) URL"));
  }

  const jwk = adapter.jwk;
  const jwkCheck = validatePublicJwks(jwk);
  const publicJwkSet = jwkCheck.ok ? { keys: jwkCheck.keys } : null;
  checks.push(
    jwkCheck.ok
      ? check("jwk", "Embedded JWKS", "ready", "Ed25519 public key set")
      : check("jwk", "Embedded JWKS", "error", jwkCheck.reason || "Embedded jwk must be a public Ed25519 JWKS"),
  );

  const originAuthKey = `client-origin-auth-${appOrigin}`;
  const originAuth = adapter[originAuthKey];
  const originAuthOk = typeof originAuth === "string" && originAuth.length > 0;
  checks.push(
    originAuthOk
      ? check("origin-auth", "Origin auth", "ready", originAuthKey)
      : check("origin-auth", "Origin auth", "missing", `Adapter field "${originAuthKey}" is missing`),
  );

  const privateFields = hasPrivateField(adapter) || jwksHasPrivateMaterial(jwk);
  checks.push(
    privateFields
      ? check("adapter-safety", "Adapter safety", "error", "Adapter contains a private field or JWK")
      : check("adapter-safety", "Adapter safety", "ready", "No private fields detected"),
  );

  const realmIssuer =
    authServerOk && values["auth-server-url"] && values.realm
      ? issuerFor(values["auth-server-url"], values.realm)
      : null;
  if (realmIssuer) {
    checks.push(check("realmIssuer", "Realm issuer", "ready", realmIssuer));
  } else {
    checks.push(check("realmIssuer", "Realm issuer", "missing", "Auth server URL and realm are required"));
  }

  const requiredReady = [
    "authServer",
    "realm",
    "resource",
    "vendorId",
    "homeOrkUrl",
    "jwk",
    "origin-auth",
    "adapter-safety",
    "app-origin",
    "audience",
    "realmIssuer",
  ].every((id) => checks.some((entry) => entry.id === id && entry.status === "ready"));
  const urlsValid = authServerOk && homeOrkOk;

  const publicAdapter = {
    realm: values.realm,
    "auth-server-url": values["auth-server-url"],
    resource: values.resource,
    vendorId: values.vendorId,
    homeOrkUrl: values.homeOrkUrl,
    ...(typeof adapter.scope === "string" && adapter.scope ? { scope: adapter.scope } : {}),
    ...pickPublicTideFields(adapter),
    [originAuthKey]: originAuth,
    jwk: publicJwkSet,
  };

  return {
    configured: requiredReady && urlsValid,
    checks,
    appOrigin,
    apiAudience,
    realmIssuer,
    adapter: {
      realm: values.realm,
      authServerUrl: values["auth-server-url"],
      resource: values.resource,
      vendorId: values.vendorId,
      homeOrkUrl: values.homeOrkUrl,
      jwk: publicJwkSet,
      originAuth,
    },
    publicAdapter,
    adapterPath,
    cspOrigins,
  };
}
