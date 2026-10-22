import test from "node:test";
import assert from "node:assert/strict";
import { Models } from "../server/tide-sdk.mjs";
import { validateSignedRelationshipPolicy } from "../server/policies.mjs";
import { VENDOR_ID, signedPolicyBase64 } from "./helpers.mjs";

const context = {
  domain: "embargo.report.v1",
  realm: "http://localhost:8080/realms/embargo-test",
  reportId: "3f6d9a0e-1b2c-4d5e-8f90-123456789abc",
  revision: 1,
  assignmentId: "9c1b2a3d-4e5f-4a6b-8c7d-0123456789ab",
  vendorId: "kettle",
  ownerIss: "http://localhost:8080/realms/embargo-test",
  ownerSub: "user-1",
  writerKey: "tide-user-key-1",
};

const base = { context, vendorId: VENDOR_ID };

test("accepts structurally matching write and read grants", () => {
  const write = signedPolicyBase64({ ...base, kind: "write" });
  const read = signedPolicyBase64({ ...base, kind: "read" });
  assert.equal(
    validateSignedRelationshipPolicy(write, { ...base, kind: "write" }).policy.contractId,
    "RelationshipAttestation:1",
  );
  assert.equal(
    validateSignedRelationshipPolicy(read, { ...base, kind: "read" }).policy.contractId,
    "RelationshipAttestation:1",
  );
});

test("rejects unsigned, expired, wrong-model, wrong-execution and extra-param grants", () => {
  const cases = [
    { kind: "write", options: { signature: null }, code: "UNSIGNED_POLICY" },
    {
      kind: "write",
      options: { expiry: Math.floor(Date.now() / 1000) - 60 },
      code: "POLICY_EXPIRED",
    },
    {
      kind: "write",
      options: { modelId: ["PolicyEnabledEncryption:1"] },
      code: "INVALID_POLICY",
    },
    {
      kind: "write",
      options: { executionType: Models.ExecutionType.PUBLIC },
      code: "INVALID_POLICY",
    },
    {
      kind: "write",
      options: { extraParam: ["unexpected", "value"] },
      code: "INVALID_POLICY",
    },
    {
      kind: "write",
      options: { roles: ["_tide_encryptor", "_tide_decryptor"] },
      code: "INVALID_POLICY",
    },
  ];
  for (const item of cases) {
    const policy = signedPolicyBase64({ ...base, kind: item.kind, ...item.options });
    assert.throws(
      () => validateSignedRelationshipPolicy(policy, { ...base, kind: item.kind }),
      (error) => error.code === item.code,
      item.code,
    );
  }
});

test("rejects wrong subject, wrong key and wrong operation", () => {
  const wrongSubject = signedPolicyBase64({
    ...base,
    kind: "write",
    subjectId: "some-other-user",
  });
  assert.throws(
    () => validateSignedRelationshipPolicy(wrongSubject, { ...base, kind: "write" }),
    (error) => error.code === "POLICY_CONTEXT_MISMATCH",
  );

  const wrongKey = signedPolicyBase64({ ...base, kind: "read", keyId: "other" });
  assert.throws(
    () => validateSignedRelationshipPolicy(wrongKey, { ...base, kind: "read" }),
    (error) => error.code === "INVALID_POLICY",
  );

  const wrongRole = signedPolicyBase64({
    ...base,
    kind: "read",
    roles: ["_tide_encryptor"],
  });
  assert.throws(
    () => validateSignedRelationshipPolicy(wrongRole, { ...base, kind: "read" }),
    (error) => error.code === "INVALID_POLICY",
  );
});
