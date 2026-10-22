[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

# Embargo

## Project overview

_A bug-disclosure exchange where a researcher's report is encrypted in the browser, so the exchange that stores it, and any lone admin, cannot read it._

Built with [TideCloak](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked). Demo video: [`demo.mp4`](demo.mp4).

### 1. Vision & originality

A neutral middleman for vulnerability disclosure that never holds the secrets it routes. The exchange coordinates delivery and status, but cannot read a report's title, severity, details or proof of concept.

### 2. Trust constraint insight

Researchers must trust disclosure platforms with unpatched exploits. Whoever runs the server, or any admin who can grant themselves a role, can read them, so one breach or insider leaks zero-days. Remove that unilateral access and a shared third-party disclosure channel becomes safe to use.

### 3. Value & impact

Researchers can report to vendors they have never met without handing exploits to a platform operator. Example: Linh finds a flaw in Kettle Health's patient portal; only Kettle's analysts hold a read grant for that report.

### 4. Why TideCloak matters

Reports are encrypted in the browser under a signed Tide relationship policy; key material is split across Tide's ORK network, not held by our server. Identity and access changes go through TideCloak governance: in our live realm, changing the app's client required an approval signed in the Tide enclave before it took effect. Without Tide, our server would hold the keys, which is the exact problem.

### 5. Prototype & storytelling

The video shows a real Tide-enclave login (DPoP-bound) into the app as the researcher, and governed change requests being authorised in TideCloak. Encryption and vendor decryption are implemented but not shown live: on 22 Oct a Tide network outage (16 of 20 ORKs unreachable) blocked enrolling the vendor account.

## Setup and technical notes

This repository is a runnable implementation, not a certification. Verified live on
22 Oct 2026: realm provisioning, enclave enrolment, DPoP-bound login into the app,
and enclave-signed approval of client changes. Not yet verified live: policy
signing, encryption, vendor decryption, and the one-admin replacement-policy
negative test. Those gates require the setup in
[Live Tide setup](#live-tide-setup) and the negative tests in the design docs.

## Stack

- Node 24.21.0, native ESM, `node:http`, `node:sqlite`.
- React 19.3.1 + Vite 6.4.4 on `http://localhost:5137`.
- API on loopback `http://127.0.0.1:3001`; Vite proxies `/api`.
- Pinned Tide packages: `@tidecloak/react` 0.14.33, `@tidecloak/js` 0.14.34,
  `@tideorg/js` 0.14.29, `heimdall-tide` 0.14.34.
- Pinned `jose` 6.2.13 for EdDSA/JWT verification.
- No Next.js, no native SQLite addon, no custom cipher.

`@tideorg/js` 0.14.29 ships ESM with extensionless relative imports that Node
cannot resolve directly. `server/tide-sdk.mjs` registers a narrow resolution hook
(`server/tide-resolver.mjs`) before importing the pinned SDK, so policy bytes are
parsed by the SDK rather than by a reimplementation.

## Layout

```
server/            API, config/setup, auth, repository, policy checks, static serving
shared/            browser/Node-safe contract constants, builders and validators
tests/             node:test behavioural tests
scripts/dev-all.mjs starts/stops the API and Vite together
docs/              product, architecture and implementation planning (parent-owned)
src/, public/      frontend (separate owner)
```

## Quick start without Tide configuration

```sh
npm install
npm run migrate
npm run dev:all
```

Open `http://localhost:5137`. `GET /api/setup` reports `configured: false`, the setup
surface explains which adapter fields are missing, and protected routes return
`503 CONFIG_MISSING`. There is deliberately no mock login, local role simulation or
test login route.

When the adapter and environment are supplied, restart the API (`dev:all` does not
auto-reload the API process; frontend HMR only). `GET /api/setup` then returns only
an allowlisted public adapter; private fields and private JWKs cause
`configured: false`.

## Live Tide setup

1. **Realm and client.** Start a TideCloak instance. The optional
   `compose.yaml` binds `127.0.0.1:8080` and requires externally supplied
   credentials; it is not started automatically:

   ```sh
   export TIDECLOAK_ADMIN_USERNAME='...'
   export TIDECLOAK_ADMIN_PASSWORD='...'
   docker compose up
   ```

   Create the realm and a public client. Register web origin
   `http://localhost:5137` and callback `http://localhost:5137/auth/redirect`.
   Set `EMBARGO_AUDIENCE` to the client id (`embargo-web`) and use a client
   audience mapper. Tide ORKs refuse to sign session tokens that carry a custom
   (non-client) audience. The client must have `dpop.bound.access.tokens=true`;
   the frontend enables `useDPoP` and Vite serves the SDK's
   `/tide_dpop/...` relay page (`@tidecloak/js/vite`).

   Chrome's Local Network Access check blocks the Tide enclave
   (`https://ork*.tideprotocol.com`) from calling `localhost:8080` during
   enrolment ("Network request failed"). Allow the local-network prompt, or
   disable `chrome://flags/#local-network-access-check` for local testing.
2. **Adapter.** Download the client adapter from the TideCloak console to
   `config/tidecloak.json` (or point `TIDE_ADAPTER_PATH` at it). Never place it in
   `public/`, `dist/` or any other served directory. It must include `realm`,
   `auth-server-url`, `resource`, `vendorId`, `homeOrkUrl`, an embedded public
   JWKS at `jwk` (`{keys:[{kty:"OKP",crv:"Ed25519",x:"...",kid:"..."}]}`), and
   `client-origin-auth-http://localhost:5137`. It must not include a client secret
   or private JWK material.
3. **Roles.** Realm roles: `researcher`, `operator`, `tide-realm-admin`,
   `vendor-kettle`, `vendor-acme`, `_tide_encryptor`, `_tide_decryptor`.
   `tide-realm-admin` is also accepted from
   `resource_access['realm-management'].roles`. Vendor analysts receive their
   vendor role and `_tide_decryptor`; researchers receive `researcher` and
   `_tide_encryptor`.
4. **Environment.** Copy `.env.example` to `.env` and adjust:

   ```sh
   APP_ORIGIN=http://localhost:5137
   EMBARGO_AUDIENCE=embargo-web
   TIDE_ADAPTER_PATH=config/tidecloak.json
   TIDE_CSP_ORIGINS=
   EMBARGO_DB_PATH=data/embargo.sqlite
   EMBARGO_API_HOST=127.0.0.1
   EMBARGO_API_PORT=3001
   ```

5. **Governance.** Enrol the realm administrators and complete QEA bootstrap
   before storing sensitive data. `GET /api/admin/policy` relays a read of the
   reserved `tide-realm-admin` policy at
   `/admin/realms/{realm}/iga/role-policies/name/tide-realm-admin` using the
   **caller's** bearer. The backend never signs, approves or substitutes its own
   credential.

No account is enrolled and no Docker container is started by this application.

## Authentication and API

Every protected handler verifies its own bearer token:

- Local JWKS built from the adapter's embedded public `jwk` (`{keys:[...]}`); no
  remote JWKS and no token-selected key URL. Multiple keys are selected by the
  token's `kid`.
- EdDSA only, exact `iss`, configured API `aud`, matching `azp` client,
  non-empty `sub`, finite `exp`, and time checks (with a small clock tolerance).
- Roles come from the verified token only; there is no database role table.
- Browser writes require `Origin` to match `APP_ORIGIN` (or
  `Sec-Fetch-Site: same-origin`); there is no cookie authentication fallback.
- JSON writes require `application/json`, are capped at 1 MiB, and use exact-key
  schemas. Ciphertext is capped at 512 KiB of base64 text; policy and pending
  request blobs at 128 KiB.
- Every API response is `Cache-Control: no-store` and has a restrictive CSP.
- Tokens, bodies and report contents are never logged.

### Routes

| Method | Route | Behaviour |
|---|---|---|
| GET | `/api/health` | `{status:'ok',database:'ready'}` |
| GET | `/api/setup` | Config diagnostics; public adapter only when valid |
| POST | `/api/drafts` | Researcher; requires `tideuserkey`; server creates full-UUID context |
| GET | `/api/drafts` | Admin all (with requests); researcher own (requests hidden) |
| GET | `/api/drafts/:assignmentId` | Owner or admin |
| PUT | `/api/drafts/:assignmentId/policies` | Admin; structural signed-policy check; optimistic version |
| PUT | `/api/drafts/:assignmentId/requests` | Admin; exact bounded pending bytes; no vote counting |
| GET | `/api/admin/policy` | Admin; relays reserved policy read with caller's bearer |
| POST | `/api/reports` | Owner + researcher; both policies required; atomic insert/audit |
| GET | `/api/reports?vendorId=...` | Matching realm vendor role only |
| GET | `/api/reports/mine` | Verified owner metadata only; no ciphertext or grants |
| PATCH | `/api/reports/:assignmentId` | Matching vendor; `received -> triaged -> fixed`; versioned |
| GET | `/api/operator/raw` | Operator; ciphertext + disclosed metadata + local activity |

Errors use `{error:{code,message}}`. Not-found resources return `404`; an
unconfigured server returns `503 CONFIG_MISSING`. Activity rows include
`tamperproof: false`: the database can be rewritten by its operator.

### Policy checks are structural, not network proof

`PUT /api/drafts/:assignmentId/policies` decodes the exact signed bytes with the
pinned `@tideorg/js` `Policy.from`, then checks:

- `contractId === "RelationshipAttestation:1"`;
- both relationship model ids, `PRIVATE` execution and `IMPLICIT` approval;
- the configured realm vendor `keyId`;
- a present signature (non-empty bytes);
- `assignmentId` equals the draft assignment;
- write: `User` subject equal to the draft `writerKey`, roles exactly
  `["_tide_encryptor"]`;
- read: `Role` subject equal to the draft vendor's realm role, roles exactly
  `["_tide_decryptor"]`, no client role;
- no unknown parameters and no expired policy.

The response header `X-Embargo-Policy-Check: structural-only` makes the limit
explicit. The server does **not** verify the Tide signature cryptographically and
does not contact the ORKs. A structural pass does not prove the network will accept
the grant or that other administrators cannot issue a replacement.

## Shared report contract

`shared/contracts.mjs` exports exactly `DOMAIN`, `VENDORS`, `SEVERITIES`,
`STATUSES`, `buildPlaintextReport` and `parseDecryptedReport`. The browser encrypts
a flat JSON report containing the full context and `title`, `severity`, `details`
and `poc`. After decryption it must call `parseDecryptedReport(text,
expectedContext)`; the parser rejects unknown fields, wrong types, lengths outside
the limits and any context mismatch before display.

The backend stores only the routing context, ciphertext, signed grants, state and
local activity rows. It never receives plaintext report fields, does not render
report HTML, and does not execute PoC content.

## Production serving

```sh
npm run build
npm run start
```

`server/static.mjs` serves files only from `dist/`, resolves real paths inside the
dist root, denies dotfiles and runtime artifacts, and falls back to `index.html`
only for extensionless HTML navigation. Missing `/api/*` and missing `.json`
requests return JSON `404`, never the SPA. Set `APP_ORIGIN` to the exact browser
origin used in production (for a direct same-host start, that is
`http://localhost:3001`) and register the same origin/callback in TideCloak. HTML
gets a CSP that allows the configured auth/ORK origins, `wasm-unsafe-eval` for the
SDK, and same-origin scripts. `TIDE_CSP_ORIGINS` can add additional bare origins
when a Tide enclave re-homes. `silent-check-sso.html` is served with
`frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`, and an exact SHA-256 hash
for its inline script; the main application keeps `frame-ancestors 'none'` and
`X-Frame-Options: DENY`. Raw `tidecloak.json`/`adapter.json`, `config/`, `data/`,
`.env`, and database/log files are denied by the static server, the Vite dev
middleware, and build-output cleanup; the SDK adapter is exposed only through
validated `/api/setup`. The exact Tide enclave requirements were not exercised in
this environment. The API remains bound to loopback; a TLS reverse proxy is not
included.

## Tests

```sh
npm test
```

`node:test` covers local EdDSA JWT signature/claim failures, origin/media/size
limits, owner/admin/vendor scoping, policy wrong-context and unsigned rejection,
optimistic versions, duplicate/concurrent submission with one activity row,
status transition conflicts, persistence across reopen, operator disclosure,
admin-policy proxy path/token handling, setup allowlisting/private-field
fail-closed behaviour, shared payload mismatch, and static/API fallback
separation. Policy fixtures use opaque synthetic signature bytes for
storage tests; they are not Tide signatures or Tide ciphertext.

Not exercised here: a live Tide login, a real ORK policy signature, actual
encryption/decryption, role-change enforcement, revocation timing, or the
one-admin/two-admin replacement-policy scenario. Those remain open gates.

## Security limitations

- Routing metadata, status, timing, ciphertext length and access patterns remain
  visible to the operator.
- A compromised endpoint, malicious frontend deployment, authorised recipient
  copying plaintext, or a colluding admin quorum is outside the claim.
- SQLite state and the activity table are not tamper-proof against their operator.
- Tokens are DPoP-bound by TideCloak, but this API checks only the bearer token,
  not the DPoP proof, so replay against this API is not prevented.
- The CSP and origin checks were not validated against a live Tide enclave.
