import { Models } from "@tideorg/js";
import { PolicySignRequest } from "heimdall-tide";
import { VENDORS } from "../../shared/contracts.mjs";

export const RELATIONSHIP_CONTRACT_ID = "RelationshipAttestation:1";
export const RELATIONSHIP_MODEL_IDS = Object.freeze([
  "PolicyEnabledEncryption:1",
  "PolicyEnabledDecryption:1",
]);
export const ENCRYPT_ROLE = "_tide_encryptor";
export const DECRYPT_ROLE = "_tide_decryptor";
export const SIGN_REQUEST_EXPIRY_SECONDS = 604800;

const ROLES_FOR_ACCESS = Object.freeze({
  read: [DECRYPT_ROLE],
  write: [ENCRYPT_ROLE],
  "read-write": [ENCRYPT_ROLE, DECRYPT_ROLE],
});

const ALLOWED_POLICY_PARAMS = new Set([
  "subjectType",
  "subjectId",
  "clientId",
  "assignmentId",
  "roles",
]);

export class PolicyValidationError extends Error {
  constructor(issues) {
    super(issues.join(" "));
    this.name = "PolicyValidationError";
    this.issues = issues;
  }
}

export function bytesToBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error("Expected binary policy or ciphertext bytes.");
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Expected non-empty base64 text.");
  }
  let clean = value.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(clean)) {
    throw new Error("Value is not base64.");
  }
  if (clean.length % 4 === 1) throw new Error("Base64 length is invalid.");
  clean = clean
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(clean.length / 4) * 4, "=");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function asPolicyBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return base64ToBytes(value);
  if (value && typeof value.toBytes === "function") return value.toBytes();
  throw new Error("Expected a policy object, policy bytes, or base64 policy text.");
}

function enumName(enumObject, value) {
  const name = enumObject?.[value];
  return typeof name === "string" ? name : String(value);
}

export function describePolicy(value) {
  const policy = Models.Policy.from(asPolicyBytes(value));
  const param = (key) => {
    const raw = policy.params.entries.get(key);
    if (raw === undefined) return "";
    return typeof raw === "string" ? raw : String(raw);
  };
  const rolesRaw = param("roles");
  let roles = null;
  if (rolesRaw) {
    try {
      const parsed = JSON.parse(rolesRaw);
      if (Array.isArray(parsed) && parsed.every((role) => typeof role === "string")) {
        roles = parsed;
      }
    } catch {
      roles = null;
    }
  }
  const paramsAllStrings = Array.from(policy.params.entries.values()).every(
    (entry) => typeof entry === "string",
  );

  return {
    version: policy.version,
    contractId: policy.contractId,
    modelIds: Array.from(policy.modelIds),
    keyId: policy.keyId,
    approvalType: enumName(Models.ApprovalType, policy.approvalType),
    executionType: enumName(Models.ExecutionType, policy.executionType),
    paramsAllStrings,
    paramKeys: Array.from(policy.params.entries.keys()),
    subjectType: param("subjectType"),
    subjectId: param("subjectId"),
    clientId: param("clientId"),
    recordId: param("assignmentId"),
    rolesRaw,
    roles,
    signatureBytes: policy.signature ? policy.signature.length : 0,
    signed: Boolean(policy.signature && policy.signature.length > 0),
    expiry: policy.expiry === undefined ? null : Number(policy.expiry),
    expired: policy.hasExpired(),
  };
}

export function describePolicyBase64(base64) {
  return describePolicy(base64ToBytes(base64));
}

export function expectedGrantForDraft(kind, draft, realmVendorId) {
  if (!draft || !draft.context) return null;
  const context = draft.context;
  const vendor = VENDORS.find((item) => item.id === context.vendorId) ?? null;
  if (!vendor) return null;
  const base = {
    kind,
    realmVendorId,
    recordId: context.assignmentId,
    vendorRole: vendor.role,
    vendorName: vendor.name,
  };
  if (kind === "write") {
    return {
      ...base,
      subjectType: "User",
      subjectId: context.writerKey,
      access: "write",
      roles: ROLES_FOR_ACCESS.write,
    };
  }
  return {
    ...base,
    subjectType: "Role",
    subjectId: vendor.role,
    clientId: "",
    access: "read",
    roles: ROLES_FOR_ACCESS.read,
  };
}

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

export function inspectPolicyForGrant(value, expected, { requireSignature = true } = {}) {
  const issues = [];
  let summary;
  try {
    summary = describePolicy(value);
  } catch (error) {
    return {
      summary: null,
      issues: [`The value is not a readable Tide policy: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  if (!expected) {
    return { summary, issues: ["No expected grant is available for comparison."] };
  }

  if (summary.contractId !== RELATIONSHIP_CONTRACT_ID) {
    issues.push(`contractId must be ${RELATIONSHIP_CONTRACT_ID}, found ${summary.contractId || "(empty)"}.`);
  }
  if (!sameStringSet(summary.modelIds, RELATIONSHIP_MODEL_IDS)) {
    issues.push("modelId must contain exactly PolicyEnabledEncryption:1 and PolicyEnabledDecryption:1.");
  }
  if (expected.realmVendorId && summary.keyId !== expected.realmVendorId) {
    issues.push("keyId does not match the realm vendorId from the trusted adapter config.");
  }
  if (summary.approvalType !== "IMPLICIT") issues.push("approvalType must be IMPLICIT.");
  if (summary.executionType !== "PRIVATE") issues.push("executionType must be PRIVATE.");
  if (!summary.paramsAllStrings) issues.push("Every policy parameter must be a string.");
  if (summary.recordId !== expected.recordId) {
    issues.push("assignmentId does not match this draft's record.");
  }
  if (summary.subjectType !== expected.subjectType) {
    issues.push(`subjectType must be ${expected.subjectType}, found ${summary.subjectType || "(empty)"}.`);
  }
  if (summary.subjectId !== expected.subjectId) {
    issues.push(`subjectId must be exactly ${expected.subjectId || "(missing)"}.`);
  }
  if (expected.clientId !== undefined && summary.clientId !== expected.clientId) {
    issues.push("clientId must be absent for a realm-role recipient.");
  }
  if (expected.roles && !sameStringSet(summary.roles, expected.roles)) {
    issues.push(`roles must be exactly ${JSON.stringify(expected.roles)}.`);
  }
  const extraKeys = summary.paramKeys.filter((key) => !ALLOWED_POLICY_PARAMS.has(key));
  if (extraKeys.length > 0) {
    issues.push(`Unexpected policy parameters: ${extraKeys.join(", ")}.`);
  }
  if (summary.expired) issues.push("The policy has expired.");
  if (requireSignature && !summary.signed) {
    issues.push("The policy carries no signature.");
  }

  return { summary, issues };
}

export function assertPolicyForGrant(value, expected, options) {
  const inspection = inspectPolicyForGrant(value, expected, options);
  if (inspection.issues.length > 0) throw new PolicyValidationError(inspection.issues);
  return inspection.summary;
}

export function buildGrantPolicy(kind, { realmVendorId, context }) {
  if (!realmVendorId) {
    throw new Error("The adapter config does not expose a realm vendorId; keyId cannot be set.");
  }
  const expected = expectedGrantForDraft(kind, { context }, realmVendorId);
  if (!expected) {
    throw new Error("This draft names an unsupported vendor or has no complete context.");
  }
  if (!expected.subjectId) {
    throw new Error(
      expected.subjectType === "User"
        ? "The draft has no writer tideuserkey."
        : "The vendor role is missing.",
    );
  }

  const params = new Map([
    ["subjectType", expected.subjectType],
    ["subjectId", expected.subjectId],
    ["assignmentId", expected.recordId],
    ["roles", JSON.stringify(expected.roles)],
  ]);
  if (expected.clientId) params.set("clientId", expected.clientId);

  const policy = new Models.Policy({
    version: Models.Policy.latestVersion,
    contractId: RELATIONSHIP_CONTRACT_ID,
    modelId: [...RELATIONSHIP_MODEL_IDS],
    keyId: realmVendorId,
    approvalType: Models.ApprovalType.IMPLICIT,
    executionType: Models.ExecutionType.PRIVATE,
    params,
  });

  return { policy, expected };
}

export function newSigningRequest(policy) {
  const request = PolicySignRequest.New(policy);
  request.setCustomExpiry(SIGN_REQUEST_EXPIRY_SECONDS);
  return request;
}

export async function initializeSigningRequest(sdk, policy) {
  if (!sdk || typeof sdk.initializeTideRequest !== "function") {
    throw new Error("The TideCloak context does not expose initializeTideRequest.");
  }
  const request = newSigningRequest(policy);
  const initialized = await sdk.initializeTideRequest(request);
  if (!initialized || typeof initialized.encode !== "function" || typeof initialized.getUniqueId !== "function") {
    throw new Error("The SDK did not return an initialized Tide signing request.");
  }
  const requestId = initialized.getUniqueId();
  const encoded = initialized.encode();
  return {
    request: initialized,
    requestId,
    requestBase64: bytesToBase64(encoded),
    requestedPolicy: initialized.getRequestedPolicy(),
  };
}

export function decodeSigningRequest(requestBase64) {
  const request = PolicySignRequest.decode(base64ToBytes(requestBase64));
  if (!request || typeof request.getUniqueId !== "function" || typeof request.getRequestedPolicy !== "function") {
    throw new Error("The stored value is not an initialized policy signing request.");
  }
  return request;
}

export function describeAdminPolicy(adminPolicyBase64) {
  return describePolicyBase64(adminPolicyBase64);
}

function sameBytes(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function requestApprovalData(request) {
  if (!request || typeof request.getCurrentApprovalCount !== "function") return false;
  try {
    return request.getCurrentApprovalCount() > 0;
  } catch {
    return false;
  }
}

export async function approvePersistedRequest({
  sdk,
  requestBase64,
  expected,
}) {
  if (!sdk || typeof sdk.approveTideRequests !== "function") {
    throw new Error("The TideCloak context does not expose the approval helper.");
  }
  const decoded = decodeSigningRequest(requestBase64);
  const requestId = decoded.getUniqueId();
  const requestedPolicy = decoded.getRequestedPolicy();
  assertPolicyForGrant(requestedPolicy, expected, { requireSignature: false });
  if (requestApprovalData(decoded)) {
    return { status: "already-approved", requestId };
  }

  const results = await sdk.approveTideRequests([
    { id: requestId, request: decoded.encode() },
  ]);
  const result = Array.isArray(results) ? results[0] : null;
  if (!result || result.id !== requestId) {
    throw new Error("The Tide enclave response did not match the persisted request ID; refusing to use it.");
  }
  if (result.denied) {
    return { status: "denied", requestId };
  }
  if (!result.approved || !(result.approved.request instanceof Uint8Array)) {
    return { status: "pending", requestId };
  }

  const approved = decodeSigningRequest(bytesToBase64(result.approved.request));
  if (approved.getUniqueId() !== requestId) {
    throw new Error("The approved request changed its unique ID; refusing to persist it.");
  }
  const approvedPolicy = approved.getRequestedPolicy();
  assertPolicyForGrant(approvedPolicy, expected, { requireSignature: false });
  if (!sameBytes(approvedPolicy.toBytes(), requestedPolicy.toBytes())) {
    throw new Error("The approved request changed the requested policy bytes; refusing to persist it.");
  }
  if (!requestApprovalData(approved)) {
    throw new Error("The enclave reported approval but returned no approval record; refusing to persist it.");
  }

  return {
    status: "approved",
    requestId,
    requestBase64: bytesToBase64(approved.encode()),
  };
}

export async function finalizePersistedRequest({
  sdk,
  requestBase64,
  adminPolicyBase64,
  expected,
}) {
  if (!sdk || typeof sdk.executeTideRequest !== "function") {
    throw new Error("The TideCloak context does not expose the execution helper.");
  }
  const decoded = decodeSigningRequest(requestBase64);
  const requestId = decoded.getUniqueId();
  const requestedPolicy = decoded.getRequestedPolicy();
  assertPolicyForGrant(requestedPolicy, expected, { requireSignature: false });
  if (!requestApprovalData(decoded)) {
    throw new Error(
      "The persisted request carries no enclave approval data. Approve it first; execution was not attempted.",
    );
  }
  const adminPolicyBytes = base64ToBytes(adminPolicyBase64);
  if (adminPolicyBytes.length === 0) {
    throw new Error("The reserved admin policy bytes are empty.");
  }

  decoded.addPolicy(adminPolicyBytes);
  const signatures = await sdk.executeTideRequest(decoded.encode(), true);
  const signature = Array.isArray(signatures) ? signatures[0] : null;
  if (!(signature instanceof Uint8Array) || signature.length === 0) {
    throw new Error("The Tide network returned no signature. Nothing was stored on the draft.");
  }

  requestedPolicy.signature = signature;
  const signedBase64 = bytesToBase64(requestedPolicy.toBytes());
  const summary = assertPolicyForGrant(signedBase64, expected, { requireSignature: true });
  return { status: "signed", requestId, policy: signedBase64, summary };
}

export function encryptResultToCiphertext(result) {
  const value = Array.isArray(result) ? result[0] : result;
  if (typeof value === "string" && value.length > 0) return value;
  if (value instanceof Uint8Array && value.length > 0) return bytesToBase64(value);
  throw new Error("The SDK returned no ciphertext. Check provider initialization and the signed write grant.");
}

export function decryptResultToText(result) {
  const value = Array.isArray(result) ? result[0] : result;
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(value));
  throw new Error("The SDK returned an unexpected decryption result.");
}

function safeCause(cause) {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`.slice(0, 600);
  if (typeof cause === "string") return cause.slice(0, 600);
  if (cause && typeof cause === "object" && typeof cause.message === "string") {
    return cause.message.slice(0, 600);
  }
  return "";
}

export function classifyTideError(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  const display =
    typeof error?.displayMessage === "string"
      ? error.displayMessage
      : error instanceof Error
        ? error.message
        : String(error ?? "Unknown SDK error");
  const haystack = `${code} ${display}`.toLowerCase();

  let kind = "unknown";
  if (
    code === "TIDE-TIDEJS-NET-THRESHOLD_FAILURE" ||
    haystack.includes("threshold") ||
    haystack.includes("enough vvk")
  ) {
    kind = "threshold";
  } else if (code.startsWith("TIDE-TIDEJS-NET-")) {
    kind = "network";
  } else if (
    code.startsWith("TIDE-TIDEJS-PARSE-") ||
    code.startsWith("TIDE-TIDEJS-VAL-") ||
    code.startsWith("TIDE-TIDEJS-CRYPTO-") ||
    code.startsWith("TIDE-TIDEJS-SIG-")
  ) {
    kind = "validation";
  }

  return {
    kind,
    code: code || null,
    message: display.slice(0, 1000),
    cause: safeCause(error?.cause),
    httpStatus: typeof error?.httpStatus === "number" ? error.httpStatus : null,
    traceId: typeof error?.traceId === "string" ? error.traceId : null,
    detailsCount: Array.isArray(error?.details) ? error.details.length : 0,
  };
}
