import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { openRepository } from "../server/repository.mjs";
import { makeConfig, makeKeys, request } from "./helpers.mjs";

test("production static serving is allowlisted and never masks missing JSON/API", async (t) => {
  const keys = await makeKeys();
  const dir = mkdtempSync(join(tmpdir(), "embargo-static-"));
  mkdirSync(join(dir, "dist", "assets"), { recursive: true });
  writeFileSync(join(dir, "dist", "index.html"), "<!doctype html><div id=\"root\"></div>");
  writeFileSync(join(dir, "dist", "assets", "app.js"), "console.log('asset');");
  writeFileSync(join(dir, "dist", "tidecloak.json"), JSON.stringify({ realm: "public" }));
  writeFileSync(
    join(dir, "dist", "silent-check-sso.html"),
    "<html><body><script>parent.postMessage(location.href, location.origin)</script></body></html>",
  );
  writeFileSync(join(dir, "package.json"), JSON.stringify({ secret: "outside-dist" }));

  const repository = openRepository(":memory:");
  const config = makeConfig(keys.publicJwks);
  const app = createApp({ config, repository, distDir: join(dir, "dist") });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const root = await request(base, "/", { headers: { Accept: "text/html" } });
  assert.equal(root.status, 200);
  assert.match(root.headers.get("content-type"), /text\/html/);
  assert.match(root.headers.get("content-security-policy"), /frame-src 'self' http:\/\/localhost:8080/);
  assert.match(root.headers.get("content-security-policy"), /script-src 'self' 'wasm-unsafe-eval'/);
  assert.equal(root.headers.get("x-frame-options"), "DENY");

  const silent = await request(base, "/silent-check-sso.html");
  assert.equal(silent.status, 200);
  assert.equal(silent.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(silent.headers.get("content-security-policy"), /frame-ancestors 'self'/);
  assert.match(silent.headers.get("content-security-policy"), /sha256-/);
  assert.match(silent.headers.get("content-security-policy"), /script-src 'self' 'sha256-/);

  const rawAdapter = await request(base, "/tidecloak.json");
  assert.equal(rawAdapter.status, 404);
  assert.equal(rawAdapter.text.includes("public"), false);

  const spa = await request(base, "/reports/anything", { headers: { Accept: "text/html" } });
  assert.equal(spa.status, 200);
  assert.equal(spa.text.includes('id="root"'), true);

  const asset = await request(base, "/assets/app.js");
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /text\/javascript/);
  assert.match(asset.headers.get("cache-control"), /immutable/);

  const missingJson = await request(base, "/missing.json");
  assert.equal(missingJson.status, 404);
  assert.match(missingJson.headers.get("content-type"), /application\/json/);
  assert.equal(missingJson.text.includes('id="root"'), false);

  const missingApi = await request(base, "/api/nope");
  assert.equal(missingApi.status, 404);
  assert.equal(missingApi.json.error.code, "NOT_FOUND");
  assert.equal(missingApi.text.includes('id="root"'), false);

  const traversal = await request(base, "/%2e%2e/package.json");
  assert.equal(traversal.status, 404);

  const dotfile = await request(base, "/.env");
  assert.equal(dotfile.status, 404);

  const method = await request(base, "/", { method: "DELETE", headers: { Accept: "text/html" } });
  assert.equal(method.status, 405);
});
