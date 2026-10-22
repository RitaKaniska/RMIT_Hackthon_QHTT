import test from "node:test";
import assert from "node:assert/strict";
import {
  DOMAIN,
  SEVERITIES,
  STATUSES,
  VENDORS,
  buildPlaintextReport,
  parseDecryptedReport,
} from "../shared/contracts.mjs";

const context = {
  domain: DOMAIN,
  realm: "http://localhost:8080/realms/embargo-test",
  reportId: "3f6d9a0e-1b2c-4d5e-8f90-123456789abc",
  revision: 1,
  assignmentId: "9c1b2a3d-4e5f-4a6b-8c7d-0123456789ab",
  vendorId: "kettle",
  ownerIss: "http://localhost:8080/realms/embargo-test",
  ownerSub: "user-1",
  writerKey: "tide-user-key-1",
};

const fields = {
  title: "Synthetic finding",
  severity: "high",
  details: "A synthetic detail for a contract test.",
  poc: "curl http://example.invalid",
};

test("contracts expose the canonical constants and only those functions", async () => {
  const module = await import("../shared/contracts.mjs");
  assert.deepEqual(Object.keys(module).sort(), [
    "DOMAIN",
    "SEVERITIES",
    "STATUSES",
    "VENDORS",
    "buildPlaintextReport",
    "parseDecryptedReport",
  ]);
  assert.equal(DOMAIN, "embargo.report.v1");
  assert.deepEqual([...SEVERITIES], ["low", "medium", "high", "critical"]);
  assert.deepEqual([...STATUSES], ["received", "triaged", "fixed"]);
  assert.deepEqual(VENDORS.map((vendor) => vendor.id), ["kettle", "acme"]);
});

test("build and parse round-trip a flat report", () => {
  const text = buildPlaintextReport(context, fields);
  const parsed = JSON.parse(text);
  assert.deepEqual(Object.keys(parsed), [
    "domain",
    "realm",
    "reportId",
    "revision",
    "assignmentId",
    "vendorId",
    "ownerIss",
    "ownerSub",
    "writerKey",
    "title",
    "severity",
    "details",
    "poc",
  ]);
  assert.deepEqual(parseDecryptedReport(text, context), parsed);
});

test("parse rejects every context mismatch", () => {
  const text = buildPlaintextReport(context, fields);
  const variants = [
    { realm: "http://localhost:8080/realms/other" },
    { reportId: "11111111-1111-4111-8111-111111111111" },
    { revision: 2 },
    { assignmentId: "22222222-2222-4222-8222-222222222222" },
    { vendorId: "acme" },
    { ownerIss: "http://localhost:8080/realms/other" },
    { ownerSub: "user-2" },
    { writerKey: "tide-user-key-2" },
  ];
  for (const variant of variants) {
    assert.throws(
      () => parseDecryptedReport(text, { ...context, ...variant }),
      /context mismatch/,
    );
  }
});

test("parse rejects extra fields, type confusion and invalid lengths", () => {
  const text = buildPlaintextReport(context, fields);
  const withExtra = JSON.parse(text);
  withExtra.extra = "not allowed";
  assert.throws(() => parseDecryptedReport(JSON.stringify(withExtra), context), /unexpected fields/);

  const wrongTitle = { ...JSON.parse(text), title: 42 };
  assert.throws(() => parseDecryptedReport(JSON.stringify(wrongTitle), context), /title/);

  const wrongSeverity = { ...JSON.parse(text), severity: "urgent" };
  assert.throws(() => parseDecryptedReport(JSON.stringify(wrongSeverity), context), /severity/);

  const longDetails = { ...JSON.parse(text), details: "x".repeat(65537) };
  assert.throws(() => parseDecryptedReport(JSON.stringify(longDetails), context), /details/);

  assert.throws(() => parseDecryptedReport("not json", context), /valid JSON/);
});

test("build rejects unknown fields and invalid context", () => {
  assert.throws(() => buildPlaintextReport(context, { ...fields, extra: true }), /unexpected fields/);
  assert.throws(() => buildPlaintextReport({ ...context, extra: true }, fields), /unexpected fields/);
  assert.throws(() => buildPlaintextReport({ ...context, reportId: "short" }, fields), /reportId/);
  assert.throws(() => buildPlaintextReport({ ...context, vendorId: "other" }, fields), /vendorId/);
  assert.throws(() => buildPlaintextReport(context, { ...fields, title: "" }), /title/);
});
