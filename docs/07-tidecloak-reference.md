# 07 — TideCloak and CryptoBC-KB reference notes

These notes separate primary-source statements, facts pinned from the installed
packages, and requirements that still need runtime checks. Template observations are
historical baseline. The local Embargo app (React views, Node API, SQLite, shared
contracts, tests) exists as code, but no Tide runtime has been exercised and the
assembled app has not been built or launched.

## Pinned sources

Template:
[`truongnguyenxuanvinh/hackathon`](https://github.com/truongnguyenxuanvinh/hackathon)
at commit `82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0` (`82717cf`), cloned unmodified
for review. Permalinks:

- [`package.json`](https://github.com/truongnguyenxuanvinh/hackathon/blob/82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0/package.json)
- [`package-lock.json`](https://github.com/truongnguyenxuanvinh/hackathon/blob/82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0/package-lock.json)
- [`vite.config.js`](https://github.com/truongnguyenxuanvinh/hackathon/blob/82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0/vite.config.js)
- [`src/main.jsx`](https://github.com/truongnguyenxuanvinh/hackathon/blob/82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0/src/main.jsx)
- [`src/App.jsx`](https://github.com/truongnguyenxuanvinh/hackathon/blob/82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0/src/App.jsx)
- [`public/silent-check-sso.html`](https://github.com/truongnguyenxuanvinh/hackathon/blob/82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0/public/silent-check-sso.html)

Installed/locked versions, which are what must be cited rather than the ranges in
`package.json`:

| Package | Version | Source |
|---|---|---|
| `@tidecloak/react` | 0.14.33 | `package-lock.json`; [npm](https://www.npmjs.com/package/@tidecloak/react/v/0.14.33) |
| `@tidecloak/js` | 0.14.34 | transitive; [npm](https://www.npmjs.com/package/@tidecloak/js/v/0.14.34) |
| `heimdall-tide` | 0.14.34 | transitive; [npm](https://www.npmjs.com/package/heimdall-tide/v/0.14.34) |
| `@tideorg/js` | 0.14.29 | transitive; [npm](https://www.npmjs.com/package/@tideorg/js/v/0.14.29) |
| `react`, `react-dom` | 19.3.1 | `package-lock.json` |
| `vite` | 6.4.4 | `package-lock.json` |
| `@vitejs/plugin-react` | 4.7.0 | `package-lock.json` |

`@tidecloak/verify` and `@tidecloak/nextjs` are **not** installed by this template.
The baseline has no server verifier code. This repository adds pinned `jose` 6.2.13
in `server/auth.mjs`; its live behaviour against Tide tokens is unverified.

The coordinator inspected these pinned installed files (paths inside the package,
not in the template repository):

- `node_modules/@tidecloak/react/dist/types/contexts/TideCloakContextProvider.d.ts`
- `node_modules/@tidecloak/react/dist/esm/contexts/TideCloakContextProvider.js`
- `node_modules/@tidecloak/js/dist/types/src/IAMService.d.ts`
- `node_modules/heimdall-tide/src/models/PolicySignRequest.ts`
- `node_modules/@tidecloak/react/docs/FRONT_CHANNEL.md`

## Template authentication conventions

- Vite + React SPA. `vite.config.js` binds `localhost`, port **5137**,
  `strictPort: true`. The template README's `5173` is wrong. Do not silently
  replace `localhost` with `127.0.0.1`; OIDC origin matching is literal.
- `src/main.jsx` uses React `StrictMode` and imports
  `{ TideCloakContextProvider }` from `@tidecloak/react` with
  `configUrl="/tidecloak.json"`.
- The adapter JSON is downloaded manually from the TideCloak console and placed at
  `public/tidecloak.json` (gitignored). It is public client metadata, never a client
  secret or admin credential.
- `public/silent-check-sso.html` exists and posts `location.href` to its parent.
- `src/App.jsx` handles `/auth/redirect` after initialisation with
  `history.replaceState(null, "", "/")`. The pinned JS SDK defaults login and
  logout return URIs to `${window.location.origin}/auth/redirect` unless `redirectUri`
  is configured. At the template's root mount, the silent-SSO helper URI is
  `http://localhost:5137/silent-check-sso.html`; explicit configuration can override it.
  Register the actual callback URIs and the web origin `http://localhost:5137`.
- The template README instructs manual Docker + console realm/app setup. It does
  **not** use `npm init @tidecloak/nextjs` or `npm run init`; neither exists here.
- Missing `public/tidecloak.json` makes Vite's SPA fallback return `index.html`,
  producing `Unexpected token '<'` in the provider. Production hosting must return
  404/JSON for missing config and API routes.

## Encryption API for the pinned React version

| Model | Call shape | Recipient boundary |
|---|---|---|
| Self-encryption | `doEncrypt(items)` / `doDecrypt(items)` without policy | Encrypting user's identity; same-tag roles do not enable cross-user sharing |
| Policy-governed sharing | `doEncrypt(data, policyBytes)` / `doDecrypt(..., policyBytes)` or matching `IAMService.doEncrypt` / `IAMService.doDecrypt` calls | Network evaluates the signed policy and executor credential |

For `@tidecloak/react` 0.14.33, `useTideCloak` exposes
`doEncrypt(data, decryptionPolicy?: Uint8Array)` and `doDecrypt(...)`. The compiled
implementation (`dist/esm/contexts/TideCloakContextProvider.js`, loc. 535–565)
**does forward policy bytes to `IAMService`**. The earlier generic warning that these
hooks cannot forward policy bytes is outdated for this pinned version. Verify the
installed file before relying on it; do not apply a different version's behaviour.

Calling the encryption wrappers during initialisation returns `null`. Gate every
call on the provider's initialisation/authentication state.

Public React context helpers exposed by `useTideCloak` (not `IAMService` methods):

- `initializeTideRequest(request)` → initialised request.
- `approveTideRequests([{ id, request: Uint8Array }])` → results shaped
  `{ id, approved?: { request: Uint8Array }, denied?: boolean, pending?: boolean }`.
- `executeTideRequest(requestOrBytes, waitForAll?)` → `Uint8Array[]`.
- `getVendorId()`, `getResource()`, `getConfig()`, `getToken()`, `secureFetch()`.
- Avoid private `IAMService._tc` internals when the public wrappers suffice.

A backend cannot replace browser signing with its own signature or an unsigned REST
write.

For self-encryption only, tags use `_tide_<tag>.selfencrypt` and
`_tide_<tag>.selfdecrypt`. Those role names are not a vendor-sharing mechanism.

## Built-in shared-record policy

Use `RelationshipAttestation:1` if the target ORK build supports it. The documented
record policy uses:

- `modelId`: `["PolicyEnabledEncryption:1", "PolicyEnabledDecryption:1"]`.
- `executionType`: `PRIVATE`; realm vendor key ID from adapter configuration.
- `subjectType`: `User`, `Group` or `Role`. A User ID is the exact `tideuserkey`;
  Group IDs are exact full paths; client roles additionally name their client.
- `assignmentId`: one record revision's opaque unique ID, also its **only** SDK tag.
- Fixed operation roles `_tide_encryptor` / `_tide_decryptor`; these are necessary
  operation gates, not blanket access to every record.
- Separately signed researcher-write and vendor-read grants; use the SDK's signed
  byte serialization, not hand-built JSON or just a policy name.

Tide's [relationship-policy example](https://github.com/tide-foundation/raziel-mcp/blob/master/templates/relationship-attestation/relationship.ts),
not the supplied FairEnrol template, constructs a `PolicySignRequest`, obtains
browser-enclave approval, attaches the admin policy and executes signing. The
built-in contract avoids a custom C# deployment; it does not eliminate signing.

**Unresolved runtime gate:** does the deployed multi-admin signing path stop a lone
admin creating a valid alternate read grant for an existing `assignmentId`? Test
issuance and actual decryption, not merely a role-grant queue or a signature-shaped
result. Also test ciphertext/assignment binding and legitimate quorum-approved
regranting. This is unverified in our environment.

## Credentials, refresh and revocation

- `refreshToken()` calls `updateIAMToken()`: refresh if needed, not a guaranteed
  forced renewal.
- `forceRefreshToken()` calls `forceUpdateToken()`: forced renewal.
- DPoP support is **opt-in**, not default. Do not claim token replay immunity. If
  enabled, matching proof-bearing requests and server-side validation are required;
  treat that as a separate configured property.
- Refresh and short lifetimes may bound future revocation but cannot claw back
  plaintext or keys already used. Measure token/doken, old-policy and regrant
  behaviour separately.

## Authentication and server verification (implemented local, unverified)

The local API verifies the bearer access token in every protected handler with
pinned `jose`. It builds a local JWKS from the adapter's public `jwk`, pins EdDSA,
and requires `iss`, intended API `aud`, `azp`, non-empty `sub`, finite `exp` and
time checks. Roles are read from the verified payload. No remote JWKS or
token-selected key URL is used. `azp` identifies the requesting client and is not a
substitute for audience; configure the intended audience in TideCloak. Ownership is
keyed by `(iss, sub)`, not mutable display names. A verification failure denies
access.

These checks are code, not an observed result against a real Tide token. Never trust
token-provided `jku`/`x5u` URLs. No cookie-auth fallback is implemented; browser
writes require the configured origin. Bounded bodies and exact-key schemas are
coded. There is no Next.js `proxy.js` or server-export layer to reuse.

## QEA governance

- Documented threshold: `max(1, floor(0.7 * N))`; three admins need two approvals,
  two admins need only one.
- Enrol separate Tide accounts and verify the committed `tide-realm-admin` roster.
  Independent humans/control domains matter; browser profiles alone do not suffice.
- Governed IAM writes become change requests. Authorisation auto-commits at quorum;
  commit below quorum is rejected. Multi-admin approvals need each human's browser
  credential, not a proxy that credits one service account.
- Exercise role/composite/scope/group and admin-roster paths that could manufacture
  authority. Test policy issuance separately from role changes.
- The master realm is not governed by QEA. State that trust boundary; do not infer
  a stored-data decryption bypass without an actual accepted cryptographic path.

## Unaudited deployment limits of the template

Historical baseline only; these statements do not describe the local Embargo files.

- No backend, API, database or server-side authorisation. All business state is a
  browser reducer and resets on reload.
- The role/persona switcher and 2-of-3 approval flow are local simulations. One
  browser can act as both approvers while not signed in. The UI says so.
- "Attempt both overrides" dispatches canned blocked events, not real Tide attempts.
- Event IDs are `Date.now()`/`Math.random()`, unsuitable for security-sensitive
  records.
- `src/seed.json` is synthetic course data, not encrypted reports. The existing
  `Video.mp4` was not reviewed and is not our Embargo demonstration.
- Build success proves bundling only. Login, token validation, encryption,
  decryption, policy signing and revocation were not exercised.
- The Vite dev server is not a production deployment: no CSP, `no-store`, CSRF,
  request limits or static/API error separation is configured.
- No independent Tide accounts or reachable Tide service existed in the verified
  review environment; Docker access was denied.

## Local implementation limits

- The local app is code only: no install, build, launch or test run has been
  recorded, and no live Tide login, ORK policy signature, encryption or decryption
  has occurred.
- `server/policies.mjs` performs a structural parse with the pinned SDK and checks
  a non-empty signature. It does not verify that signature cryptographically or
  contact the ORKs. A pass does not prove the network accepts the grant.
- The canonical embedded `adapter.jwk` is `{keys:[public JWK,...]}`; there is no
  remote JWKS fallback. Live handling of that shape remains unexercised.
- Open code-review leads include decrypted-payload exact-key validation, canonical
  adapter JWKS handling, persistence of approvals below quorum and silent-SSO CSP
  headers. They are not verified fixes and this document does not assert their
  state either way.
- No live Tide instance, adapter, independently enrolled admins or enrolled vendor
  accounts were available. Local role gates and three accounts under one actor do
  not demonstrate 2-of-3 independence or replacement-policy resistance.
- The CSP and origin checks have not been validated against a live Tide enclave or
  a real browser login.

## Research sources

Local CryptoBC-KB notes used in [03-architecture.md](03-architecture.md):

- `cbc-threat-modeling`: assets, adversaries, trust boundaries and metadata leakage.
- `cbc-mac-and-aead`, `cbc-key-management`: authenticated context and key separation.
- `cbc-jwt-and-oauth-pitfalls`: audience/issuer/algorithm/key-source validation.
- `cbc-koth-crypto`: verify-first, transactional replay/state protections.
- `cbc-crypto-usage-pitfalls`: avoid homebrew primitives and unsafe composition.

The KB is guidance, not a certification of Tide. Version-scope every integration
claim and follow primary sources where a general KB rule is insufficient.

Primary sources:
- [Shared-model distinction and role setup](https://github.com/tide-foundation/raziel-mcp/blob/master/playbooks/configure-e2ee-roles-and-policies.md)
- [Shared-encryption playbook](https://github.com/tide-foundation/raziel-mcp/blob/master/playbooks/setup-forseti-e2ee.md)
- [Relationship policy template](https://github.com/tide-foundation/raziel-mcp/blob/master/templates/relationship-attestation/relationship.ts)
- [QEA setup](https://docs.tide.org/Admin/SetupIGA)
- [QEA workflow and threshold](https://docs.tide.org/Core-Concepts/iga-workflow)
- [Verifier contract](https://github.com/tide-foundation/tidecloak-js/tree/main/packages/tidecloak-verify)
- [Quickstart](https://docs.tide.org/get-started/Tidecloak%20Quickstart)
- [Coding-agent MCP](https://tide.org/agent-plugins)
- [Tide support](https://discord.gg/XBMd9ny2q5)
