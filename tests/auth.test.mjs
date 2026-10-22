import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { createTokenVerifier, isAdminPayload, rolesFromPayload } from "../server/auth.mjs";
import { AUDIENCE, CLIENT_ID, REALM_ISSUER, makeKeys, makeToken } from "./helpers.mjs";

async function verifierFor(keys) {
  return createTokenVerifier({
    jwk: keys.publicJwks,
    issuer: REALM_ISSUER,
    audience: AUDIENCE,
    clientId: CLIENT_ID,
  });
}

function basePayload(extra = {}) {
  return {
    azp: CLIENT_ID,
    realm_access: { roles: ["researcher"] },
    ...extra,
  };
}

test("verifies a locally signed EdDSA token and reads roles", async () => {
  const keys = await makeKeys();
  const verify = await verifierFor(keys);
  const token = await new SignJWT(basePayload({ tideuserkey: "key-1" }))
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer(REALM_ISSUER)
    .setAudience(AUDIENCE)
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keys.privateKey);
  const payload = await verify(token);
  assert.equal(payload.sub, "user-1");
  assert.equal(payload.tideuserkey, "key-1");
  assert.deepEqual(rolesFromPayload(payload), { realmRoles: ["researcher"], realmManagement: [] });
});

test("rejects a token signed by another key", async () => {
  const keys = await makeKeys();
  const other = await makeKeys();
  const verify = await verifierFor(keys);
  const token = await new SignJWT(basePayload())
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer(REALM_ISSUER)
    .setAudience(AUDIENCE)
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(other.privateKey);
  await assert.rejects(() => verify(token));
});

test("rejects expired, wrong issuer, wrong audience, wrong azp and missing claims", async () => {
  const keys = await makeKeys();
  const verify = await verifierFor(keys);
  const now = Math.floor(Date.now() / 1000);

  const expired = await new SignJWT(basePayload())
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer(REALM_ISSUER)
    .setAudience(AUDIENCE)
    .setSubject("user-1")
    .setIssuedAt(now - 120)
    .setExpirationTime(now - 30)
    .sign(keys.privateKey);
  await assert.rejects(() => verify(expired));

  const wrongIssuer = await new SignJWT(basePayload())
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer("http://localhost:8080/realms/other")
    .setAudience(AUDIENCE)
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keys.privateKey);
  await assert.rejects(() => verify(wrongIssuer));

  const wrongAudience = await new SignJWT(basePayload())
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer(REALM_ISSUER)
    .setAudience("another-api")
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keys.privateKey);
  await assert.rejects(() => verify(wrongAudience));

  const wrongAzp = await new SignJWT(basePayload({ azp: "another-client" }))
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer(REALM_ISSUER)
    .setAudience(AUDIENCE)
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keys.privateKey);
  await assert.rejects(() => verify(wrongAzp));

  const noSubject = await new SignJWT(basePayload())
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer(REALM_ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keys.privateKey);
  await assert.rejects(() => verify(noSubject));

  const noAudience = await new SignJWT(basePayload())
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer(REALM_ISSUER)
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keys.privateKey);
  await assert.rejects(() => verify(noAudience));

  const noAzp = await new SignJWT({ realm_access: { roles: ["researcher"] } })
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer(REALM_ISSUER)
    .setAudience(AUDIENCE)
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keys.privateKey);
  await assert.rejects(() => verify(noAzp));
});

test("rejects an unexpected algorithm", async () => {
  const keys = await makeKeys();
  const verify = await verifierFor(keys);
  const secret = new TextEncoder().encode("not-the-configured-key");
  const token = await new SignJWT(basePayload())
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(REALM_ISSUER)
    .setAudience(AUDIENCE)
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
  await assert.rejects(() => verify(token));
});

test("selects the matching key by kid from a multi-key JWKS", async () => {
  const first = await makeKeys("key-1");
  const second = await makeKeys("key-2");
  const verify = createTokenVerifier({
    jwk: { keys: [...first.publicJwks.keys, ...second.publicJwks.keys] },
    issuer: REALM_ISSUER,
    audience: AUDIENCE,
    clientId: CLIENT_ID,
  });
  const valid = await makeToken(second.privateKey, { kid: "key-2" });
  assert.equal((await verify(valid)).sub, "user-1");

  const wrongKid = await makeToken(second.privateKey, { kid: "key-1" });
  await assert.rejects(() => verify(wrongKid));

  const noKid = await makeToken(second.privateKey);
  await assert.rejects(() => verify(noKid));
});

test("admin accepts realm role or realm-management client role only", () => {
  assert.equal(isAdminPayload({ realm_access: { roles: ["tide-realm-admin"] } }), true);
  assert.equal(
    isAdminPayload({ resource_access: { "realm-management": { roles: ["tide-realm-admin"] } } }),
    true,
  );
  assert.equal(isAdminPayload({ resource_access: { other: { roles: ["tide-realm-admin"] } } }), false);
  assert.equal(isAdminPayload({ realm_access: { roles: ["vendor-kettle"] } }), false);
  assert.equal(isAdminPayload({}), false);
});
