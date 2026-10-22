import { createLocalJWKSet, jwtVerify } from "jose";

const BEARER_RE = /^Bearer ([A-Za-z0-9._~+/=-]+)$/i;

export function extractBearerToken(request) {
  const header = request.headers.authorization;
  if (typeof header !== "string" || header.length > 16384) return null;
  const match = BEARER_RE.exec(header);
  return match ? match[1] : null;
}

export function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

export function rolesFromPayload(payload) {
  const realmRoles = stringArray(payload?.realm_access?.roles);
  const realmManagement = stringArray(payload?.resource_access?.["realm-management"]?.roles);
  return { realmRoles, realmManagement };
}

export function isAdminPayload(payload) {
  const { realmRoles, realmManagement } = rolesFromPayload(payload);
  return realmRoles.includes("tide-realm-admin") || realmManagement.includes("tide-realm-admin");
}

export function createTokenVerifier({ jwk, issuer, audience, clientId, clockTolerance = 5 }) {
  if (!jwk || typeof jwk !== "object" || !Array.isArray(jwk.keys) || jwk.keys.length === 0) {
    throw new Error("An embedded public JWKS is required");
  }
  if (typeof issuer !== "string" || issuer.length === 0) throw new Error("An issuer is required");
  if (typeof audience !== "string" || audience.length === 0) throw new Error("An audience is required");
  if (typeof clientId !== "string" || clientId.length === 0) throw new Error("A client id is required");
  const jwks = createLocalJWKSet(jwk);

  return async function verifyToken(token) {
    if (typeof token !== "string" || token.length === 0 || token.length > 16384) {
      throw new Error("Token is missing or too large");
    }
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ["EdDSA"],
      issuer,
      audience,
      clockTolerance,
      requiredClaims: ["iss", "aud", "azp", "exp", "sub"],
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 255) {
      throw new Error("Token subject is invalid");
    }
    if (typeof payload.azp !== "string" || payload.azp !== clientId) {
      throw new Error("Token authorised party does not match the configured client");
    }
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
      throw new Error("Token expiry is invalid");
    }
    if (payload.iat !== undefined) {
      if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat)) {
        throw new Error("Token issued-at claim is invalid");
      }
      if (payload.iat > Math.floor(Date.now() / 1000) + clockTolerance + 60) {
        throw new Error("Token issued-at claim is in the future");
      }
    }
    return payload;
  };
}

export function requestHasAllowedOrigin(request, appOrigin) {
  const origin = request.headers.origin;
  const fetchSite = request.headers["sec-fetch-site"];
  if (origin !== undefined) {
    return origin === appOrigin;
  }
  if (fetchSite !== undefined) {
    return fetchSite === "same-origin";
  }
  return true;
}
