import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../server/config.mjs";
import { APP_ORIGIN, VENDOR_ID, makeKeys } from "./helpers.mjs";

function baseAdapter(publicJwks) {
  return {
    realm: "embargo-test",
    "auth-server-url": "http://localhost:8080",
    resource: "embargo-web",
    vendorId: VENDOR_ID,
    homeOrkUrl: "http://localhost:8080",
    ["client-origin-auth-" + APP_ORIGIN]: "origin-auth",
    jwk: publicJwks,
  };
}

async function withAdapter(t, adapter) {
  const dir = mkdtempSync(join(tmpdir(), "embargo-config-"));
  const path = join(dir, "adapter.json");
  writeFileSync(path, typeof adapter === "string" ? adapter : JSON.stringify(adapter));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return loadConfig({ TIDE_ADAPTER_PATH: path, APP_ORIGIN });
}

test("canonical public JWKS enables configured setup and is allowlisted", async (t) => {
  const keys = await makeKeys();
  const config = await withAdapter(t, baseAdapter(keys.publicJwks));
  assert.equal(config.configured, true);
  assert.equal(config.realmIssuer, "http://localhost:8080/realms/embargo-test");
  assert.equal(config.adapter.vendorId, VENDOR_ID);
  assert.equal(config.adapter.jwk.keys.length, 1);
  assert.equal(config.publicAdapter.jwk.keys.length, 1);
  assert.equal(config.publicAdapter.jwk.keys[0].kid, "test-key-1");
  assert.equal(config.publicAdapter.jwk.keys[0].d, undefined);
  assert.deepEqual(Object.keys(config.publicAdapter).sort(), [
    "auth-server-url",
    "client-origin-auth-" + APP_ORIGIN,
    "homeOrkUrl",
    "jwk",
    "realm",
    "resource",
    "vendorId",
  ]);
});

test("multiple canonical keys are preserved", async (t) => {
  const first = await makeKeys("key-1");
  const second = await makeKeys("key-2");
  const jwks = { keys: [...first.publicJwks.keys, ...second.publicJwks.keys] };
  const config = await withAdapter(t, baseAdapter(jwks));
  assert.equal(config.configured, true);
  assert.deepEqual(
    config.publicAdapter.jwk.keys.map((key) => key.kid),
    ["key-1", "key-2"],
  );
});

test("private fields and private JWK material fail closed", async (t) => {
  const keys = await makeKeys();
  const withSecret = baseAdapter(keys.publicJwks);
  withSecret["client-secret"] = "should-not-be-public";
  const secretConfig = await withAdapter(t, withSecret);
  assert.equal(secretConfig.configured, false);
  assert.ok(secretConfig.checks.some((entry) => entry.id === "adapter-safety" && entry.status === "error"));

  const withPrivateJwk = baseAdapter({
    keys: [{ ...keys.publicJwks.keys[0], d: "private-material" }],
  });
  const jwkConfig = await withAdapter(t, withPrivateJwk);
  assert.equal(jwkConfig.configured, false);
  assert.ok(jwkConfig.checks.some((entry) => entry.id === "adapter-safety" && entry.status === "error"));
  assert.ok(jwkConfig.checks.some((entry) => entry.id === "jwk" && entry.status === "error"));
});

test("missing, malformed or single JWK material stays unconfigured instead of crashing", async (t) => {
  const keys = await makeKeys();
  const noJwk = baseAdapter(keys.publicJwks);
  delete noJwk.jwk;
  const noJwkConfig = await withAdapter(t, noJwk);
  assert.equal(noJwkConfig.configured, false);
  assert.ok(noJwkConfig.checks.some((entry) => entry.id === "jwk" && entry.status === "error"));

  const singleJwk = await withAdapter(t, baseAdapter(keys.publicJwk));
  assert.equal(singleJwk.configured, false);
  assert.ok(singleJwk.checks.some((entry) => entry.id === "jwk" && entry.status === "error"));

  const badKey = baseAdapter({
    keys: [{ ...keys.publicJwks.keys[0], x: "short-key" }],
  });
  const badKeyConfig = await withAdapter(t, badKey);
  assert.equal(badKeyConfig.configured, false);
  assert.ok(badKeyConfig.checks.some((entry) => entry.id === "jwk" && entry.status === "error"));

  const noOrigin = baseAdapter(keys.publicJwks);
  delete noOrigin["client-origin-auth-" + APP_ORIGIN];
  const noOriginConfig = await withAdapter(t, noOrigin);
  assert.equal(noOriginConfig.configured, false);
  assert.ok(noOriginConfig.checks.some((entry) => entry.id === "origin-auth" && entry.status === "missing"));

  const malformed = await withAdapter(t, "{not-json");
  assert.equal(malformed.configured, false);
  assert.ok(malformed.checks.some((entry) => entry.id === "adapter" && entry.status === "error"));
  assert.equal(malformed.publicAdapter, null);
});
