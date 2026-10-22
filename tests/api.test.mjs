import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../server/config.mjs";
import { openRepository } from "../server/repository.mjs";
import { createApp } from "../server/app.mjs";
import http from "node:http";
import {
  APP_ORIGIN,
  AUDIENCE,
  REALM_ISSUER,
  VENDOR_ID,
  errorCode,
  makeToken,
  request,
  signedPolicyBase64,
  startTestServer,
} from "./helpers.mjs";

test("missing configuration keeps health/setup honest and protected routes 503", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "embargo-missing-"));
  const config = loadConfig({
    TIDE_ADAPTER_PATH: join(dir, "no-adapter.json"),
    APP_ORIGIN,
    EMBARGO_AUDIENCE: AUDIENCE,
  });
  assert.equal(config.configured, false);
  const repository = openRepository(":memory:");
  const app = createApp({ config, repository, distDir: null });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const health = await request(base, "/api/health");
  assert.equal(health.status, 200);
  assert.deepEqual(health.json, { status: "ok", database: "ready" });

  const setup = await request(base, "/api/setup");
  assert.equal(setup.status, 200);
  assert.equal(setup.json.configured, false);
  assert.equal(setup.json.config, undefined);
  assert.equal(setup.json.realmIssuer, null);
  assert.ok(setup.json.checks.some((entry) => entry.id === "adapter" && entry.status === "missing"));

  const drafts = await request(base, "/api/drafts", {
    method: "POST",
    token: "not-a-real-token",
    body: { vendorId: "kettle" },
  });
  assert.equal(drafts.status, 503);
  assert.equal(errorCode(drafts), "CONFIG_MISSING");
});

test("API enforces auth, limits, ownership, policies, reports and operator disclosure", async (t) => {
  const s = await startTestServer(t);
  const tokens = {
    researcher: await makeToken(s.keys.privateKey, {
      sub: "user-1",
      payload: { tideuserkey: "writer-key-1", realm_access: { roles: ["researcher"] } },
    }),
    otherResearcher: await makeToken(s.keys.privateKey, {
      sub: "user-2",
      payload: { tideuserkey: "writer-key-2", realm_access: { roles: ["researcher"] } },
    }),
    admin: await makeToken(s.keys.privateKey, {
      sub: "admin-1",
      payload: { realm_access: { roles: ["tide-realm-admin"] } },
    }),
    kettle: await makeToken(s.keys.privateKey, {
      sub: "sam",
      payload: { realm_access: { roles: ["vendor-kettle"] } },
    }),
    acme: await makeToken(s.keys.privateKey, {
      sub: "jo",
      payload: { realm_access: { roles: ["vendor-acme"] } },
    }),
    operator: await makeToken(s.keys.privateKey, {
      sub: "max",
      payload: { realm_access: { roles: ["operator"] } },
    }),
  };

  const draftRequest = (overrides = {}) =>
    request(s.base, "/api/drafts", {
      method: "POST",
      token: tokens.researcher,
      body: { vendorId: "kettle" },
      ...overrides,
    });

  await t.test("health, setup and public config", async () => {
    const health = await request(s.base, "/api/health");
    assert.equal(health.status, 200);
    assert.deepEqual(health.json, { status: "ok", database: "ready" });

    const setup = await request(s.base, "/api/setup");
    assert.equal(setup.status, 200);
    assert.equal(setup.json.configured, true);
    assert.equal(setup.json.realmIssuer, REALM_ISSUER);
    assert.equal(setup.json.apiAudience, AUDIENCE);
    assert.equal(setup.json.config["client-origin-auth-" + APP_ORIGIN], "test-origin-auth");
    assert.equal(setup.json.config["client-secret"], undefined);
    assert.equal(setup.json.config.jwk.d, undefined);
  });

  await t.test("unauthenticated, cross-origin, media-type and size limits", async () => {
    const unauthenticated = await request(s.base, "/api/drafts", {
      method: "POST",
      body: { vendorId: "kettle" },
    });
    assert.equal(unauthenticated.status, 401);
    assert.equal(errorCode(unauthenticated), "UNAUTHORIZED");

    const wrongOrigin = await draftRequest({ origin: "http://evil.example" });
    assert.equal(wrongOrigin.status, 403);
    assert.equal(errorCode(wrongOrigin), "ORIGIN_FORBIDDEN");

    const wrongType = await request(s.base, "/api/drafts", {
      method: "POST",
      token: tokens.researcher,
      body: '{"vendorId":"kettle"}',
      headers: { "Content-Type": "text/plain" },
    });
    assert.equal(wrongType.status, 415);
    assert.equal(errorCode(wrongType), "UNSUPPORTED_MEDIA_TYPE");

    const huge = await request(s.base, "/api/drafts", {
      method: "POST",
      token: tokens.researcher,
      body: JSON.stringify({ vendorId: "kettle", padding: "x".repeat(1024 * 1024 + 10) }),
    });
    assert.equal(huge.status, 413);
    assert.equal(errorCode(huge), "PAYLOAD_TOO_LARGE");

    const unknownField = await request(s.base, "/api/drafts", {
      method: "POST",
      token: tokens.researcher,
      body: { vendorId: "kettle", extra: true },
    });
    assert.equal(unknownField.status, 400);
    assert.equal(errorCode(unknownField), "INVALID_BODY");

    const noTideUserKey = await makeToken(s.keys.privateKey, {
      sub: "user-9",
      payload: { realm_access: { roles: ["researcher"] } },
    });
    const missingClaim = await request(s.base, "/api/drafts", {
      method: "POST",
      token: noTideUserKey,
      body: { vendorId: "kettle" },
    });
    assert.equal(missingClaim.status, 403);
    assert.equal(errorCode(missingClaim), "TIDEUSERKEY_REQUIRED");
  });

  let draft;
  await t.test("researcher creates a draft with server-owned context", async () => {
    const response = await draftRequest();
    assert.equal(response.status, 201);
    draft = response.json.draft;
    assert.equal(draft.context.domain, "embargo.report.v1");
    assert.equal(draft.context.realm, REALM_ISSUER);
    assert.equal(draft.context.vendorId, "kettle");
    assert.equal(draft.context.ownerSub, "user-1");
    assert.equal(draft.context.writerKey, "writer-key-1");
    assert.match(draft.context.reportId, /^[0-9a-f-]{36}$/i);
    assert.match(draft.context.assignmentId, /^[0-9a-f-]{36}$/i);
    assert.notEqual(draft.context.reportId, draft.context.assignmentId);
    assert.equal(draft.context.revision, 1);
    assert.equal(draft.stateVersion, 1);
    assert.equal(draft.writePolicy, null);
    assert.equal(draft.readPolicy, null);
    assert.equal(draft.writeRequest, null);
    assert.equal(draft.readRequest, null);
    assert.equal(draft.submitted, false);
  });

  await t.test("draft reads are owner/admin only and hide requests from owners", async () => {
    const owner = await request(s.base, `/api/drafts/${draft.context.assignmentId}`, {
      token: tokens.researcher,
    });
    assert.equal(owner.status, 200);
    assert.equal(owner.json.draft.writeRequest, null);

    const other = await request(s.base, `/api/drafts/${draft.context.assignmentId}`, {
      token: tokens.otherResearcher,
    });
    assert.equal(other.status, 403);
    assert.equal(errorCode(other), "FORBIDDEN");

    const admin = await request(s.base, `/api/drafts/${draft.context.assignmentId}`, {
      token: tokens.admin,
    });
    assert.equal(admin.status, 200);
    assert.equal(admin.json.draft.writeRequest, null);

    const list = await request(s.base, "/api/drafts", { token: tokens.researcher });
    assert.equal(list.status, 200);
    assert.equal(list.json.drafts.length, 1);
    assert.equal(list.json.drafts[0].writeRequest, null);

    const otherList = await request(s.base, "/api/drafts", { token: tokens.otherResearcher });
    assert.equal(otherList.status, 200);
    assert.deepEqual(otherList.json.drafts, []);

    const adminList = await request(s.base, "/api/drafts", { token: tokens.admin });
    assert.equal(adminList.status, 200);
    assert.equal(adminList.json.drafts.length, 1);
  });

  await t.test("policy validation rejects unsigned and wrong-context grants", async () => {
    const notAdmin = await request(s.base, `/api/drafts/${draft.context.assignmentId}/policies`, {
      method: "PUT",
      token: tokens.researcher,
      body: { kind: "write", policy: "AAAA", expectedVersion: 1 },
    });
    assert.equal(notAdmin.status, 403);

    const unsigned = signedPolicyBase64({
      kind: "write",
      context: draft.context,
      vendorId: VENDOR_ID,
      signature: null,
    });
    const unsignedResponse = await request(s.base, `/api/drafts/${draft.context.assignmentId}/policies`, {
      method: "PUT",
      token: tokens.admin,
      body: { kind: "write", policy: unsigned, expectedVersion: 1 },
    });
    assert.equal(unsignedResponse.status, 400);
    assert.equal(errorCode(unsignedResponse), "UNSIGNED_POLICY");

    const wrongContext = signedPolicyBase64({
      kind: "write",
      context: draft.context,
      vendorId: VENDOR_ID,
      assignmentId: randomUUID(),
    });
    const wrongContextResponse = await request(s.base, `/api/drafts/${draft.context.assignmentId}/policies`, {
      method: "PUT",
      token: tokens.admin,
      body: { kind: "write", policy: wrongContext, expectedVersion: 1 },
    });
    assert.equal(wrongContextResponse.status, 400);
    assert.equal(errorCode(wrongContextResponse), "POLICY_CONTEXT_MISMATCH");

    const wrongKey = signedPolicyBase64({
      kind: "write",
      context: draft.context,
      vendorId: VENDOR_ID,
      keyId: "another-vendor",
    });
    const wrongKeyResponse = await request(s.base, `/api/drafts/${draft.context.assignmentId}/policies`, {
      method: "PUT",
      token: tokens.admin,
      body: { kind: "write", policy: wrongKey, expectedVersion: 1 },
    });
    assert.equal(wrongKeyResponse.status, 400);
    assert.equal(errorCode(wrongKeyResponse), "INVALID_POLICY");

    const wrongReader = signedPolicyBase64({
      kind: "read",
      context: draft.context,
      vendorId: VENDOR_ID,
      subjectId: "vendor-acme",
    });
    const wrongReaderResponse = await request(s.base, `/api/drafts/${draft.context.assignmentId}/policies`, {
      method: "PUT",
      token: tokens.admin,
      body: { kind: "read", policy: wrongReader, expectedVersion: 1 },
    });
    assert.equal(wrongReaderResponse.status, 400);
    assert.equal(errorCode(wrongReaderResponse), "POLICY_CONTEXT_MISMATCH");
  });

  await t.test("signed grants persist with optimistic versions and structural labeling", async () => {
    const writePolicy = signedPolicyBase64({ kind: "write", context: draft.context, vendorId: VENDOR_ID });
    const write = await request(s.base, `/api/drafts/${draft.context.assignmentId}/policies`, {
      method: "PUT",
      token: tokens.admin,
      body: { kind: "write", policy: writePolicy, expectedVersion: 1 },
    });
    assert.equal(write.status, 200);
    assert.equal(write.headers.get("x-embargo-policy-check"), "structural-only");
    assert.equal(write.json.draft.stateVersion, 2);
    assert.equal(write.json.draft.writePolicy, writePolicy);

    const readPolicy = signedPolicyBase64({ kind: "read", context: draft.context, vendorId: VENDOR_ID });
    const read = await request(s.base, `/api/drafts/${draft.context.assignmentId}/policies`, {
      method: "PUT",
      token: tokens.admin,
      body: { kind: "read", policy: readPolicy, expectedVersion: 2 },
    });
    assert.equal(read.status, 200);
    assert.equal(read.json.draft.stateVersion, 3);
    assert.equal(read.json.draft.readPolicy, readPolicy);
    draft = read.json.draft;

    const stale = await request(s.base, `/api/drafts/${draft.context.assignmentId}/policies`, {
      method: "PUT",
      token: tokens.admin,
      body: { kind: "write", policy: writePolicy, expectedVersion: 1 },
    });
    assert.equal(stale.status, 409);
    assert.equal(errorCode(stale), "VERSION_CONFLICT");
  });

  await t.test("pending requests are admin-only and cleared by a saved grant", async () => {
    const pending = Buffer.from("opaque-pending-request").toString("base64");
    const put = await request(s.base, `/api/drafts/${draft.context.assignmentId}/requests`, {
      method: "PUT",
      token: tokens.admin,
      body: { kind: "write", request: pending, expectedVersion: 3 },
    });
    assert.equal(put.status, 200);
    assert.equal(put.json.draft.writeRequest, pending);
    assert.equal(put.json.draft.stateVersion, 4);
    draft = put.json.draft;

    const ownerView = await request(s.base, `/api/drafts/${draft.context.assignmentId}`, {
      token: tokens.researcher,
    });
    assert.equal(ownerView.json.draft.writeRequest, null);

    const adminView = await request(s.base, `/api/drafts/${draft.context.assignmentId}`, {
      token: tokens.admin,
    });
    assert.equal(adminView.json.draft.writeRequest, pending);

    const notAdmin = await request(s.base, `/api/drafts/${draft.context.assignmentId}/requests`, {
      method: "PUT",
      token: tokens.researcher,
      body: { kind: "write", request: pending, expectedVersion: 4 },
    });
    assert.equal(notAdmin.status, 403);

    const invalidBase64 = await request(s.base, `/api/drafts/${draft.context.assignmentId}/requests`, {
      method: "PUT",
      token: tokens.admin,
      body: { kind: "write", request: "not base64", expectedVersion: 4 },
    });
    assert.equal(invalidBase64.status, 400);
    assert.equal(errorCode(invalidBase64), "INVALID_BASE64");

    const writePolicy = signedPolicyBase64({ kind: "write", context: draft.context, vendorId: VENDOR_ID });
    const cleared = await request(s.base, `/api/drafts/${draft.context.assignmentId}/policies`, {
      method: "PUT",
      token: tokens.admin,
      body: { kind: "write", policy: writePolicy, expectedVersion: 4 },
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.json.draft.writeRequest, null);
    assert.equal(cleared.json.draft.stateVersion, 5);
    draft = cleared.json.draft;
  });

  const ciphertext = Buffer.from("opaque-synthetic-ciphertext").toString("base64");

  await t.test("submission requires ownership, policies and non-duplicate state", async () => {
    const other = await request(s.base, "/api/reports", {
      method: "POST",
      token: tokens.otherResearcher,
      body: { assignmentId: draft.context.assignmentId, ciphertext },
    });
    assert.equal(other.status, 403);

    const malformed = await request(s.base, "/api/reports", {
      method: "POST",
      token: tokens.researcher,
      body: { assignmentId: draft.context.assignmentId, ciphertext: "not base64" },
    });
    assert.equal(malformed.status, 400);
    assert.equal(errorCode(malformed), "INVALID_BASE64");

    const submitted = await request(s.base, "/api/reports", {
      method: "POST",
      token: tokens.researcher,
      body: { assignmentId: draft.context.assignmentId, ciphertext },
    });
    assert.equal(submitted.status, 201);
    assert.equal(submitted.json.report.status, "received");
    assert.equal(submitted.json.report.ciphertext, ciphertext);
    assert.equal(submitted.json.report.stateVersion, 1);
    assert.equal(submitted.json.report.readPolicy, draft.readPolicy);
    assert.equal(submitted.json.report.context.assignmentId, draft.context.assignmentId);

    const duplicate = await request(s.base, "/api/reports", {
      method: "POST",
      token: tokens.researcher,
      body: { assignmentId: draft.context.assignmentId, ciphertext },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(errorCode(duplicate), "REPORT_EXISTS");

    const lockedPolicy = await request(s.base, `/api/drafts/${draft.context.assignmentId}/policies`, {
      method: "PUT",
      token: tokens.admin,
      body: {
        kind: "write",
        policy: signedPolicyBase64({ kind: "write", context: draft.context, vendorId: VENDOR_ID }),
        expectedVersion: 5,
      },
    });
    assert.equal(lockedPolicy.status, 409);
    assert.equal(errorCode(lockedPolicy), "DRAFT_LOCKED");

    const lockedRequest = await request(s.base, `/api/drafts/${draft.context.assignmentId}/requests`, {
      method: "PUT",
      token: tokens.admin,
      body: { kind: "write", request: null, expectedVersion: 5 },
    });
    assert.equal(lockedRequest.status, 409);
    assert.equal(errorCode(lockedRequest), "DRAFT_LOCKED");
  });

  await t.test("vendor and owner reads are scoped", async () => {
    const acme = await request(s.base, "/api/reports?vendorId=kettle", { token: tokens.acme });
    assert.equal(acme.status, 403);

    const kettle = await request(s.base, "/api/reports?vendorId=kettle", { token: tokens.kettle });
    assert.equal(kettle.status, 200);
    assert.equal(kettle.json.reports.length, 1);
    assert.equal(kettle.json.reports[0].context.vendorId, "kettle");

    const adminWithoutVendorRole = await request(s.base, "/api/reports?vendorId=kettle", {
      token: tokens.admin,
    });
    assert.equal(adminWithoutVendorRole.status, 403);

    const noVendorParameter = await request(s.base, "/api/reports", { token: tokens.kettle });
    assert.equal(noVendorParameter.status, 400);

    const mine = await request(s.base, "/api/reports/mine", { token: tokens.researcher });
    assert.equal(mine.status, 200);
    assert.equal(mine.json.reports.length, 1);
    const metadata = mine.json.reports[0];
    assert.deepEqual(Object.keys(metadata).sort(), ["context", "createdAt", "stateVersion", "status"]);
    assert.equal(metadata.ciphertext, undefined);
    assert.equal(metadata.readPolicy, undefined);

    const otherMine = await request(s.base, "/api/reports/mine", { token: tokens.otherResearcher });
    assert.equal(otherMine.status, 200);
    assert.deepEqual(otherMine.json.reports, []);
  });

  await t.test("status transitions are vendor-scoped and versioned", async () => {
    const assignmentId = draft.context.assignmentId;
    const wrongVendor = await request(s.base, `/api/reports/${assignmentId}`, {
      method: "PATCH",
      token: tokens.acme,
      body: { status: "triaged", expectedVersion: 1 },
    });
    assert.equal(wrongVendor.status, 403);

    const illegalJump = await request(s.base, `/api/reports/${assignmentId}`, {
      method: "PATCH",
      token: tokens.kettle,
      body: { status: "fixed", expectedVersion: 1 },
    });
    assert.equal(illegalJump.status, 409);
    assert.equal(errorCode(illegalJump), "INVALID_TRANSITION");

    const triaged = await request(s.base, `/api/reports/${assignmentId}`, {
      method: "PATCH",
      token: tokens.kettle,
      body: { status: "triaged", expectedVersion: 1 },
    });
    assert.equal(triaged.status, 200);
    assert.equal(triaged.json.report.status, "triaged");
    assert.equal(triaged.json.report.stateVersion, 2);

    const stale = await request(s.base, `/api/reports/${assignmentId}`, {
      method: "PATCH",
      token: tokens.kettle,
      body: { status: "fixed", expectedVersion: 1 },
    });
    assert.equal(stale.status, 409);
    assert.equal(errorCode(stale), "VERSION_CONFLICT");

    const fixed = await request(s.base, `/api/reports/${assignmentId}`, {
      method: "PATCH",
      token: tokens.kettle,
      body: { status: "fixed", expectedVersion: 2 },
    });
    assert.equal(fixed.status, 200);
    assert.equal(fixed.json.report.status, "fixed");
    assert.equal(fixed.json.report.stateVersion, 3);

    const finalAgain = await request(s.base, `/api/reports/${assignmentId}`, {
      method: "PATCH",
      token: tokens.kettle,
      body: { status: "fixed", expectedVersion: 3 },
    });
    assert.equal(finalAgain.status, 409);
    assert.equal(errorCode(finalAgain), "INVALID_TRANSITION");
  });

  await t.test("operator disclosure is role-gated and excludes grants and tokens", async () => {
    const denied = await request(s.base, "/api/operator/raw", { token: tokens.researcher });
    assert.equal(denied.status, 403);

    const raw = await request(s.base, "/api/operator/raw", { token: tokens.operator });
    assert.equal(raw.status, 200);
    assert.equal(raw.json.reports.length, 1);
    assert.equal(raw.json.reports[0].ciphertext, ciphertext);
    assert.equal(raw.json.reports[0].readPolicy, undefined);
    assert.ok(raw.json.activity.length >= 1);
    for (const entry of raw.json.activity) {
      assert.equal(entry.tamperproof, false);
      assert.equal(entry.token, undefined);
      assert.equal(entry.writeRequest, undefined);
    }
    const serialized = raw.text;
    assert.equal(serialized.includes(tokens.admin), false);
    assert.equal(serialized.includes(tokens.researcher), false);
    assert.equal(serialized.includes(Buffer.from("opaque-pending-request").toString("base64")), false);
  });

  await t.test("concurrent duplicate submissions commit one report and one activity", async () => {
    const created = await request(s.base, "/api/drafts", {
      method: "POST",
      token: tokens.researcher,
      body: { vendorId: "acme" },
    });
    assert.equal(created.status, 201);
    let second = created.json.draft;
    const writePolicy = signedPolicyBase64({
      kind: "write",
      context: second.context,
      vendorId: VENDOR_ID,
    });
    const readPolicy = signedPolicyBase64({
      kind: "read",
      context: second.context,
      vendorId: VENDOR_ID,
    });
    const withWrite = await request(s.base, `/api/drafts/${second.context.assignmentId}/policies`, {
      method: "PUT",
      token: tokens.admin,
      body: { kind: "write", policy: writePolicy, expectedVersion: second.stateVersion },
    });
    assert.equal(withWrite.status, 200);
    second = withWrite.json.draft;
    const withRead = await request(s.base, `/api/drafts/${second.context.assignmentId}/policies`, {
      method: "PUT",
      token: tokens.admin,
      body: { kind: "read", policy: readPolicy, expectedVersion: second.stateVersion },
    });
    assert.equal(withRead.status, 200);

    const secondCiphertext = Buffer.from("opaque-synthetic-ciphertext-2").toString("base64");
    const body = { assignmentId: second.context.assignmentId, ciphertext: secondCiphertext };
    const [left, right] = await Promise.all([
      request(s.base, "/api/reports", { method: "POST", token: tokens.researcher, body }),
      request(s.base, "/api/reports", { method: "POST", token: tokens.researcher, body }),
    ]);
    const statuses = [left.status, right.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [201, 409]);

    const raw = await request(s.base, "/api/operator/raw", { token: tokens.operator });
    const submissions = raw.json.activity.filter(
      (entry) => entry.action === "report.submitted" && entry.assignmentId === second.context.assignmentId,
    );
    assert.equal(submissions.length, 1);

    const reopened = openRepository(s.dbPath);
    try {
      const persisted = reopened.getReport(second.context.assignmentId, REALM_ISSUER);
      assert.equal(persisted.ciphertext, secondCiphertext);
      assert.equal(persisted.status, "received");
      const persistedDraft = reopened.getDraft(second.context.assignmentId);
      assert.equal(persistedDraft.submitted, true);
    } finally {
      reopened.close();
    }
  });
});

test("admin policy proxy uses the caller token and exact reserved policy path", async (t) => {
  let captured = null;
  const adminPolicy = Buffer.from("opaque-admin-policy").toString("base64");
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ policy: adminPolicy }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const s = await startTestServer(t, { fetchImpl });
  const admin = await makeToken(s.keys.privateKey, {
    sub: "admin-1",
    payload: { realm_access: { roles: ["tide-realm-admin"] } },
  });
  const researcher = await makeToken(s.keys.privateKey, {
    payload: { tideuserkey: "writer-key-1", realm_access: { roles: ["researcher"] } },
  });

  const denied = await request(s.base, "/api/admin/policy", { token: researcher });
  assert.equal(denied.status, 403);
  assert.equal(captured, null);

  const allowed = await request(s.base, "/api/admin/policy", { token: admin });
  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.json, { policy: adminPolicy });
  assert.equal(
    captured.url,
    "http://localhost:8080/admin/realms/embargo-test/iga/role-policies/name/tide-realm-admin",
  );
  assert.equal(captured.options.headers.Authorization, `Bearer ${admin}`);
  assert.equal(captured.options.redirect, "error");
});

test("admin policy proxy fails closed on wrong upstream shapes", async (t) => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify([{ name: "some-other-policy", policy: "AAAA" }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const s = await startTestServer(t, { fetchImpl });
  const admin = await makeToken(s.keys.privateKey, {
    payload: { realm_access: { roles: ["tide-realm-admin"] } },
  });
  const response = await request(s.base, "/api/admin/policy", { token: admin });
  assert.equal(response.status, 503);
  assert.equal(errorCode(response), "ADMIN_POLICY_UNAVAILABLE");
  assert.equal(calls, 1);
  assert.equal(response.text.includes(admin), false);
});
