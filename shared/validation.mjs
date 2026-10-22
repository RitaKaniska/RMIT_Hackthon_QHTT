const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isNonEmptyString(value, max = 4096) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

export function assertExactKeys(value, keys, label = "object") {
  if (!isPlainObject(value)) throw new Error(`${label} must be a plain object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    throw new Error(`${label} has unexpected fields`);
  }
}

export function isHttpUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isNormalisedIssuer(value) {
  if (!isHttpUrl(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.search === "" &&
      url.hash === "" &&
      url.pathname !== "/" &&
      !value.endsWith("/")
    );
  } catch {
    return false;
  }
}

export function normaliseOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Origin must use http or https");
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error("Origin must not contain a path, query or fragment");
  }
  return url.origin;
}

export function validateVendorId(value) {
  return value === "kettle" || value === "acme";
}

// Ed25519 public JWK fields. `d` (and the RSA/EC private parameters) must never
// appear in an adapter that is served to browsers or used for verification.
export const PRIVATE_JWK_FIELDS = Object.freeze(["d", "p", "q", "dp", "dq", "qi", "oth", "k"]);
const PUBLIC_JWK_FIELDS = Object.freeze(["kty", "crv", "x", "y", "n", "e", "alg", "kid", "use", "key_ops"]);
const ED25519_X_RE = /^[A-Za-z0-9_-]{43}=?$/;
const MAX_JWKS_KEYS = 16;

export function jwkHasPrivateMaterial(jwk) {
  return isPlainObject(jwk) && PRIVATE_JWK_FIELDS.some((field) => field in jwk);
}

export function jwksHasPrivateMaterial(jwks) {
  if (!isPlainObject(jwks)) return false;
  if (Array.isArray(jwks.keys)) return jwks.keys.some((key) => jwkHasPrivateMaterial(key));
  return jwkHasPrivateMaterial(jwks);
}

export function publicJwkView(jwk) {
  if (!isPlainObject(jwk)) return null;
  const view = {};
  for (const field of PUBLIC_JWK_FIELDS) {
    if (jwk[field] !== undefined) view[field] = jwk[field];
  }
  return view;
}

/**
 * Validate the canonical embedded adapter JWKS shape `{keys:[public JWK,...]}`.
 * Returns `{ok:true, keys:[sanitised public JWK,...]}` or `{ok:false, reason}`.
 * Never throws: callers report `configured:false` instead.
 */
export function validatePublicJwks(jwks, maxKeys = MAX_JWKS_KEYS) {
  if (!isPlainObject(jwks)) return { ok: false, reason: "jwk must be an object with a keys array" };
  if (!Array.isArray(jwks.keys)) return { ok: false, reason: "jwk.keys must be an array" };
  if (jwks.keys.length === 0) return { ok: false, reason: "jwk.keys must contain at least one public Ed25519 key" };
  if (jwks.keys.length > maxKeys) return { ok: false, reason: `jwk.keys must contain at most ${maxKeys} keys` };
  const kids = new Set();
  const keys = [];
  for (let index = 0; index < jwks.keys.length; index += 1) {
    const key = jwks.keys[index];
    if (!isPlainObject(key)) return { ok: false, reason: `jwk.keys[${index}] must be an object` };
    if (jwkHasPrivateMaterial(key)) return { ok: false, reason: `jwk.keys[${index}] contains private key material` };
    if (key.kty !== "OKP" || key.crv !== "Ed25519") {
      return { ok: false, reason: `jwk.keys[${index}] must be an Ed25519 OKP public key` };
    }
    if (typeof key.x !== "string" || !ED25519_X_RE.test(key.x)) {
      return { ok: false, reason: `jwk.keys[${index}] is not a valid Ed25519 public key` };
    }
    if (key.alg !== undefined && key.alg !== "EdDSA") {
      return { ok: false, reason: `jwk.keys[${index}] alg must be EdDSA` };
    }
    if (key.use !== undefined && key.use !== "sig") {
      return { ok: false, reason: `jwk.keys[${index}] use must be sig` };
    }
    if (typeof key.kid !== "string" || key.kid.length === 0 || key.kid.length > 256) {
      return { ok: false, reason: `jwk.keys[${index}] must carry a kid` };
    }
    if (kids.has(key.kid)) return { ok: false, reason: `jwk.keys[${index}] kid is duplicated` };
    kids.add(key.kid);
    keys.push(publicJwkView(key));
  }
  return { ok: true, keys };
}

export function validateContext(context) {
  assertExactKeys(
    context,
    ["domain", "realm", "reportId", "revision", "assignmentId", "vendorId", "ownerIss", "ownerSub", "writerKey"],
    "context",
  );
  if (context.domain !== "embargo.report.v1") throw new Error("context.domain is not recognised");
  if (!isNormalisedIssuer(context.realm)) throw new Error("context.realm is not a normalised issuer URL");
  if (!isUuid(context.reportId)) throw new Error("context.reportId is not a UUID");
  if (!Number.isInteger(context.revision) || context.revision < 1) {
    throw new Error("context.revision must be a positive integer");
  }
  if (!isUuid(context.assignmentId)) throw new Error("context.assignmentId is not a UUID");
  if (!validateVendorId(context.vendorId)) throw new Error("context.vendorId is not a known vendor");
  if (!isNonEmptyString(context.ownerIss, 2048)) throw new Error("context.ownerIss is invalid");
  if (!isNonEmptyString(context.ownerSub, 255)) throw new Error("context.ownerSub is invalid");
  if (!isNonEmptyString(context.writerKey, 8192)) throw new Error("context.writerKey is invalid");
  return context;
}
