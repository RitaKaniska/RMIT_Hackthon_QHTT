import { ApiError } from "./errors.mjs";
import { VENDORS } from "../shared/contracts.mjs";
import { Models } from "./tide-sdk.mjs";

export const RELATIONSHIP_CONTRACT_ID = "RelationshipAttestation:1";
export const RELATIONSHIP_MODEL_IDS = Object.freeze([
  "PolicyEnabledEncryption:1",
  "PolicyEnabledDecryption:1",
]);
export const ENCRYPT_ROLE = "_tide_encryptor";
export const DECRYPT_ROLE = "_tide_decryptor";
export const MAX_POLICY_TEXT = 128 * 1024;
export const MAX_REQUEST_TEXT = 128 * 1024;
export const MAX_CIPHERTEXT_TEXT = 512 * 1024;

const { Policy, ApprovalType, ExecutionType } = Models;
const ALLOWED_PARAM_KEYS = new Set(["subjectType", "subjectId", "clientId", "assignmentId", "roles"]);

export function decodeBase64Strict(text, maxTextLength, label) {
  if (typeof text !== "string" || text.length === 0) {
    throw new ApiError(400, "INVALID_BASE64", `${label} must be non-empty base64 text`);
  }
  if (text.length > maxTextLength) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", `${label} exceeds ${maxTextLength} characters`);
  }
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    throw new ApiError(400, "INVALID_BASE64", `${label} is not canonical base64`);
  }
  const bytes = Buffer.from(text, "base64");
  if (bytes.toString("base64") !== text) {
    throw new ApiError(400, "INVALID_BASE64", `${label} is not canonical base64`);
  }
  return bytes;
}

function policyParam(policy, key) {
  const value = policy.params.entries.get(key);
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_POLICY", `Policy parameter ${key} must be a string`);
  }
  return value;
}

function parseRoles(policy) {
  const raw = policyParam(policy, "roles");
  if (typeof raw !== "string") {
    throw new ApiError(400, "INVALID_POLICY", "Policy is missing the roles parameter");
  }
  let roles;
  try {
    roles = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "INVALID_POLICY", "Policy roles parameter is not JSON");
  }
  if (!Array.isArray(roles) || roles.some((role) => typeof role !== "string")) {
    throw new ApiError(400, "INVALID_POLICY", "Policy roles parameter must be a JSON string array");
  }
  return roles;
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validateSignedRelationshipPolicy(policyText, { kind, context, vendorId, now = Date.now() }) {
  if (kind !== "write" && kind !== "read") {
    throw new ApiError(400, "INVALID_KIND", "kind must be write or read");
  }
  decodeBase64Strict(policyText, MAX_POLICY_TEXT, "policy");

  let policy;
  try {
    policy = Policy.from(Buffer.from(policyText, "base64"));
  } catch {
    throw new ApiError(400, "INVALID_POLICY", "Policy bytes could not be decoded by the pinned SDK");
  }

  if (policy.contractId !== RELATIONSHIP_CONTRACT_ID) {
    throw new ApiError(400, "INVALID_POLICY", "Policy is not a RelationshipAttestation:1 grant");
  }
  if (!(policy.signature instanceof Uint8Array) || policy.signature.length === 0) {
    throw new ApiError(400, "UNSIGNED_POLICY", "Policy has no signature");
  }
  if (policy.executionType !== ExecutionType.PRIVATE) {
    throw new ApiError(400, "INVALID_POLICY", "Policy execution type must be PRIVATE");
  }
  if (policy.approvalType !== ApprovalType.IMPLICIT) {
    throw new ApiError(400, "INVALID_POLICY", "Policy approval type must be IMPLICIT");
  }
  if (policy.keyId !== vendorId) {
    throw new ApiError(400, "INVALID_POLICY", "Policy key id does not match the configured vendor");
  }
  if (
    policy.modelIds.length !== RELATIONSHIP_MODEL_IDS.length ||
    !RELATIONSHIP_MODEL_IDS.every((model) => policy.modelIds.includes(model))
  ) {
    throw new ApiError(400, "INVALID_POLICY", "Policy model ids are not the relationship encryption/decryption pair");
  }
  if (!policy.params || !(policy.params.entries instanceof Map)) {
    throw new ApiError(400, "INVALID_POLICY", "Policy parameters are missing");
  }
  for (const key of policy.params.entries.keys()) {
    if (!ALLOWED_PARAM_KEYS.has(key)) {
      throw new ApiError(400, "INVALID_POLICY", `Policy parameter ${key} is not part of a relationship grant`);
    }
  }

  const subjectType = policyParam(policy, "subjectType");
  const subjectId = policyParam(policy, "subjectId");
  const assignmentId = policyParam(policy, "assignmentId");
  const clientId = policyParam(policy, "clientId");
  const roles = parseRoles(policy);

  if (assignmentId !== context.assignmentId) {
    throw new ApiError(400, "POLICY_CONTEXT_MISMATCH", "Policy assignmentId does not match the draft");
  }

  if (kind === "write") {
    if (subjectType !== "User" || subjectId !== context.writerKey) {
      throw new ApiError(400, "POLICY_CONTEXT_MISMATCH", "Write policy must name the draft writer's tideuserkey");
    }
    if (clientId !== undefined && clientId !== "") {
      throw new ApiError(400, "INVALID_POLICY", "User write policy must not name a client");
    }
    if (!sameStrings(roles, [ENCRYPT_ROLE])) {
      throw new ApiError(400, "INVALID_POLICY", "Write policy must grant only _tide_encryptor");
    }
  } else {
    const vendorRole = VENDORS.find((vendor) => vendor.id === context.vendorId)?.role;
    if (subjectType !== "Role" || subjectId !== vendorRole) {
      throw new ApiError(400, "POLICY_CONTEXT_MISMATCH", "Read policy must name the draft vendor role");
    }
    if (clientId !== undefined && clientId !== "") {
      throw new ApiError(400, "INVALID_POLICY", "Vendor read policy must name a realm role, not a client role");
    }
    if (!sameStrings(roles, [DECRYPT_ROLE])) {
      throw new ApiError(400, "INVALID_POLICY", "Read policy must grant only _tide_decryptor");
    }
  }

  if (policy.expiry !== undefined && policy.expiry < BigInt(Math.floor(now / 1000))) {
    throw new ApiError(400, "POLICY_EXPIRED", "Policy has expired");
  }

  return { policy, bytes: Buffer.from(policyText, "base64") };
}

export function validateEncodedRequest(requestText) {
  decodeBase64Strict(requestText, MAX_REQUEST_TEXT, "request");
  return requestText;
}

export function validateCiphertext(ciphertext) {
  decodeBase64Strict(ciphertext, MAX_CIPHERTEXT_TEXT, "ciphertext");
  return ciphertext;
}

function extractPolicy(parsed) {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.policy === "string") {
    return parsed.policy;
  }
  const candidates = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray(parsed.policies)
      ? parsed.policies
      : null;
  if (candidates) {
    const named = candidates.find(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        (entry.name === "tide-realm-admin" ||
          entry.roleName === "tide-realm-admin" ||
          entry.policyName === "tide-realm-admin"),
    );
    if (named && typeof named.policy === "string") return named.policy;
  }
  return null;
}

export async function fetchReservedAdminPolicy({ adapter, token, fetchImpl = globalThis.fetch }) {
  const base = String(adapter.authServerUrl).replace(/\/+$/, "");
  const url = `${base}/admin/realms/${encodeURIComponent(adapter.realm)}/iga/role-policies/name/tide-realm-admin`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(503, "ADMIN_POLICY_UNAVAILABLE", "The configured Tide admin endpoint could not be reached");
  }
  if (!response.ok) {
    throw new ApiError(503, "ADMIN_POLICY_UNAVAILABLE", "The configured Tide admin endpoint refused the read");
  }
  let text;
  try {
    text = await response.text();
  } catch {
    throw new ApiError(503, "ADMIN_POLICY_UNAVAILABLE", "The admin policy response could not be read");
  }
  if (text.length > 262144) {
    throw new ApiError(503, "ADMIN_POLICY_UNAVAILABLE", "The admin policy response was too large");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(503, "ADMIN_POLICY_UNAVAILABLE", "The admin policy response was not JSON");
  }
  const policy = extractPolicy(parsed);
  if (typeof policy !== "string" || policy.length === 0) {
    throw new ApiError(
      503,
      "ADMIN_POLICY_UNAVAILABLE",
      "The admin policy response did not contain the reserved tide-realm-admin policy",
    );
  }
  decodeBase64Strict(policy, MAX_POLICY_TEXT, "admin policy");
  return policy;
}
