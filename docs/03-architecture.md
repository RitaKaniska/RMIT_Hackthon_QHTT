# 03 — Architecture and security boundaries

## Status and evidence labels

| Label | Meaning |
|---|---|
| **Baseline (template)** | Present in the pinned FairEnrol template and observed by the project coordinator in an isolated clone; historical evidence only |
| **Implemented (local)** | Code exists in this repository; the coordinator has not yet built, launched or exercised the assembled app |
| **Proposed** | A remaining planned addition or change; not implemented |
| **Requirement** | Security property the design needs; no evidence yet that Tide enforces it for our deployment |

Security design was revised using the local **CryptoBC-KB**. Nothing below is
evidence that the local code runs correctly or that a TideCloak integration works.
No Tide request, login, encryption, decryption or policy signature has been
exercised by this project. All real-network gates in
[04-implementation-plan.md](04-implementation-plan.md) remain open.

## Baseline (template): Vite + React (historical)

Source: [`truongnguyenxuanvinh/hackathon`](https://github.com/truongnguyenxuanvinh/hackathon)
at commit `82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0` (short `82717cf`), cloned
unmodified for review. Root files are `.gitignore`, `README.md`, `Video.mp4`,
`index.html`, `package-lock.json`, `package.json`, `public/silent-check-sso.html`,
`src/App.jsx`, `src/main.jsx`, `src/seed.json`, `src/style.css`, `vite.config.js`.
There is no backend, API router, SQLite database, Next.js app, `proxy.js`, realm
bootstrap script, test script, encryption call or policy-signing business flow.

Exact locked dependency versions (the `package.json` ranges are not the installed
versions):

| Package | Locked version | `package.json` range |
|---|---|---|
| `@tidecloak/react` | 0.14.33 | `^0.14.33` |
| `@tidecloak/js` | 0.14.34 | transitive |
| `heimdall-tide` | 0.14.34 | transitive |
| `@tideorg/js` | 0.14.29 | transitive |
| `react`, `react-dom` | 19.3.1 | `^19.1.0` |
| `vite` | 6.4.4 | `^6.3.5` |
| `@vitejs/plugin-react` | 4.7.0 | `^4.7.0` |

`@tidecloak/verify` and `@tidecloak/nextjs` are **not** installed by this template.

Baseline frontend behaviour:

- `src/main.jsx` renders React `StrictMode` with `TideCloakContextProvider
  configUrl="/tidecloak.json"` imported from `@tidecloak/react`.
- `vite.config.js` sets `server.host = "localhost"`, `port = 5137`,
  `strictPort = true`. The actual dev URL is `http://localhost:5137/`. The
  template README's `5173` is wrong.
- `public/silent-check-sso.html` posts `location.href` to its parent; it is the
  committed silent-SSO helper.
- `src/App.jsx` rewrites `/auth/redirect` to `/` with `history.replaceState` after
  initialisation.
- Application state is a local `useReducer` over `src/seed.json` courses/students,
  plus requests, panel and audit arrays. It resets on reload. There is no durable
  or multi-user state.
- A role/persona dropdown selects simulated actors (`student`, `registrar`,
  `approver`). Realm-role flags (`registrar`/`admin`, `approver`) are displayed as
  hints only; they authorise no API because no API exists.
- `approvals.length >= 2` mutates local state. One browser can impersonate both
  simulated approvers while not signed in.
- "Attempt both overrides" dispatches two canned `blocked` audit events. These are
  not unauthorised Tide calls and prove nothing about Tide enforcement.
- The UI already warns: "TideCloak login is real when configured. The role switcher
  and 2-of-3 exception flow below are local simulations, not Tide-enforced
  authorization." We keep that honesty; we do not present the simulation as a
  discovered undisclosed security promise.
- Event IDs use `Date.now()`/`Math.random()`. They are demo-local and are not
  acceptable identifiers for security-sensitive records.
- `src/seed.json` contains synthetic courses and students, not encrypted
  vulnerability reports. `Video.mp4` is the template artifact, not Embargo evidence.

Baseline environment checks (2026-10-22, isolated clone): `npm ci
--ignore-scripts` installed 69 packages; `npm run build` succeeded (Vite 6.4.4,
133 transformed modules, 1.38 s); `npm run dev` served
`http://localhost:5137/`; the page rendered without `public/tidecloak.json` or a
Tide server and showed a JSON parse error (`Unexpected token '<'`) because Vite's
SPA fallback returned `index.html` for the missing config. Login was not
successfully tested. The documentation author did not run these checks.

## Current local stack (implemented, runtime-unverified)

| Layer | Baseline | Present in this repository | Runtime status |
|---|---|---|---|
| Client | Vite 6.4.4 + React 19.3.1, port 5137, FairEnrol UI | Embargo views under `src/` (overview, researcher, vendor inbox, my reports, admin, operator, probe, setup) | Not built or launched |
| Authentication UI | `@tidecloak/react` 0.14.33 provider, `/auth/redirect`, silent SSO | Same provider conventions; mounts only after `/api/setup` returns a configured public adapter | Not exercised against a Tide realm |
| API | None | Node 24.21.0 ESM `node:http` app under `server/`, loopback `127.0.0.1:3001` | Not launched |
| Shared contracts | None | `shared/contracts.mjs`, `shared/validation.mjs`: domain, vendors, severities, statuses, context and payload parsers | Unit-level code present; suite not run |
| Storage | Browser reducer only | SQLite via `node:sqlite`, parameterised queries, unique constraints, transactions and an activity table under `server/repository.mjs` | Not migrated or exercised |
| Dev routing | None | Vite `/api` proxy to `127.0.0.1:3001`; `scripts/dev-all.mjs` starts API and Vite | Not run together |
| Server verification | None | Per-handler bearer verification with `jose`: local JWKS from the adapter's public JWK, pinned EdDSA, `iss`/`aud`/`azp`/`exp`/`sub` and role extraction from the verified payload | Never exercised against a signed token from Tide |
| Policy checks | None | `server/policies.mjs` parses exact signed bytes with the pinned SDK and enforces relationship contract, models, execution/approval type, vendor key, assignment, subject, roles, signature presence and expiry | Structural check only; no network signature verification |
| Dependencies | Locked template versions | Tide packages pinned; `jose` 6.2.13 added; Node 24 engine declared | `package-lock.json` present; no clean-clone install recorded |

`server/static.mjs` also serves a production `dist/` behind a path allowlist,
denies dotfiles/runtime artifacts, and separates missing JSON/API requests from SPA
fallback. It is implemented but not run against a built bundle. The 5137
development port does not imply a production preview URL.

Do not add a custom cipher, MAC, key-wrapping scheme, Shamir implementation or
server-held backup decryption key. Tide owns cryptographic operations; the app owns
correct policy selection, identity binding, routing and state transitions.

### Integration review leads

These code-review leads were still open when this documentation was written. They
are **not** verified fixes and this document does not assert either their presence
or their resolution:

- decrypted-payload exact-key validation;
- canonical `adapter.jwk` JWKS handling (`{keys:[public JWK,...]}`, no remote JWKS
  fallback);
- persistence of cryptographic approvals below quorum;
- silent-SSO CSP headers.

Do not use the local code's checks as evidence that a live ORK accepts a grant.

## Threat model

| Adversary | Target property | What is not implied |
|---|---|---|
| Database reader / backup theft | Cannot recover encrypted report fields from stored records | Routing metadata and sizes are not hidden |
| Wrong vendor, given ciphertext and policies | Network denies unauthorised decryption | Hiding a decrypt button or returning HTTP 403 is not proof |
| One realm administrator | Cannot grant themselves effective access through any authority path | Three accounts held by that administrator are not independent |
| Unprivileged API client | Cannot overwrite another report, spoof its owner or replay a state change | SQL constraints do not protect against a malicious database owner |
| Modified storage/API response | Mismatched authenticated context is rejected before rendering | Freshness of a wholly rolled-back history needs an external trusted checkpoint |

Assume authentic reviewed frontend/SDK code, uncompromised authorised endpoints,
non-colluding governance participants and the Tide network's security assumptions.
A platform operator able to replace application JavaScript can target future input
or decrypted content. CSP mitigates injection bugs, not a malicious deployer.
Protection against that deployer requires independently trusted client distribution
or equivalent infrastructure outside this prototype's claim.

The Tide `master` realm is outside QEA. Document bootstrap/master credentials and
which team controls them; do not infer that a realm-admin refusal proves resistance
to master/infrastructure control. Conversely, the escape hatch alone is not evidence
that an attacker can decrypt stored ciphertext.

## Shared encryption: use the correct model

**Without a policy, `doEncrypt` creates self-encrypted data.** Giving another user
the same `_tide_<tag>.selfdecrypt` role does not let them read it.

For the pinned `@tidecloak/react` 0.14.33, the `useTideCloak` encryption/decryption
wrappers accept an optional policy `Uint8Array` and **do** forward those bytes to
`IAMService` (compiled implementation in
`node_modules/@tidecloak/react/dist/esm/contexts/TideCloakContextProvider.js`,
loc. 535–565, as inspected by the coordinator). The earlier warning that these
hooks cannot forward policy bytes is outdated for this version. Still verify the
call shape in the installed package before relying on it. Direct calls to
`IAMService.doEncrypt` / `IAMService.doDecrypt` also accept policy bytes. The public
React context helpers `initializeTideRequest`, `approveTideRequests` and
`executeTideRequest` support request signing; they are not alternative encryption
calls or methods with those names on `IAMService`.

Calling the encryption wrappers during initialisation returns `null`. Gate on the
provider's initialisation/authentication state before destructuring or using the
result.

Use the built-in `RelationshipAttestation:1` contract where supported by the target
ORK deployment. Its documented shape is:

| Field | Required binding |
|---|---|
| `contractId` | `RelationshipAttestation:1` |
| `modelId` | `PolicyEnabledEncryption:1` and `PolicyEnabledDecryption:1` |
| `executionType` | `PRIVATE` |
| `keyId` | Realm vendor ID from the trusted adapter configuration |
| `assignmentId` | Unique opaque ID for one immutable report revision |
| SDK tags | Exactly `[assignmentId]`; not the vendor name and no extra tags |
| Subject | Researcher identity for writing; matching vendor role for reading |
| Operation | Write grant: `_tide_encryptor`; read grant: `_tide_decryptor` |

The fixed realm roles enable operations, but **do not themselves authorise reading
every report**. The signed relationship policy must match the record, subject and
operation. A `User` subject uses the exact `tideuserkey` claim, not a username.
Vendor subjects use the exact `vendor-kettle` or `vendor-acme` realm role.

Keep the SDK's policy serialization and signing path. Before submission, establish
the draft revision ID and obtain its signed grants. Use separate write/read grants
for the researcher and vendor. Store and transport the exact signed bytes; an
unsigned object or a non-empty signature field is not proof of verification. If
policy signing is unavailable, block the workflow rather than falling back to
self-encryption, shared credentials or API-only filtering.

**Unresolved gate:** a single-admin path that issues a valid alternate read policy
for an existing assignment has not been tested. A protected role grant does not
prove it is blocked. See the authority section.

## Governance: protect every route to authority

### Synthetic users

| Identity | Roles / purpose |
|---|---|
| `linh` | `appUser`, `researcher`, `_tide_encryptor` |
| `sam` | `appUser`, `vendor-kettle`, `_tide_decryptor` |
| `jo` | `appUser`, `vendor-acme`, `_tide_decryptor` |
| `max` | `operator`, `tide-realm-admin`, `_tide_decryptor` in the authority-test fixture; no matching recipient role/grant |
| `admin2`, `admin3` | Independently controlled `tide-realm-admin` identities |
| `alex` | `appUser`, `vendor-kettle`, `_tide_decryptor`, until removed |

QEA's documented threshold is `max(1, floor(0.7 * N))`: three admins require two
approvals; two admins require only one. Finish bootstrap before collecting sensitive
data, verify the committed admin roster, and disclose that local browser profiles
demonstrate account separation, not organisational independence.

Governed role grants, composites, groups, scopes, admin additions/removals and
credential-producing configuration must not offer a unilateral route around the
policy. Removing admins must not let one actor lower the threshold.

**Separate blocking gate: policy issuance.** Exercise the exact signing path,
policy substitution and regranting after revocation against the real multi-admin
realm. Verify that the admin policy and approver identities actually enforce the
required independent approvals. The sample browser-signing code alone is not proof
of multi-admin safety. For the authority test, legitimately provision Max's
`_tide_decryptor` operation role first; this isolates recipient-policy authority
from the operation gate. Use the same Max identity, assignment ID, ciphertext and
intended recipient grant for one-admin and two-admin controls. The quorum-approved
positive control must decrypt successfully. A missing operation role, app filter,
context-rendering check or outage must not be counted as proof that policy issuance
is governed.

Approvals must originate from each admin's browser using their own credential.
Do not proxy all approvals through a single backend service identity. If one signer
can mint a usable replacement grant, the no-unilateral-access requirement fails:
obtain a Tide-supported cryptographically enforced approval policy before claiming
that guarantee. An app-side `approvedBy` array cannot repair it.

## Data model and authenticated context

Use full CSPRNG-generated UUIDs, not truncated eight-hex-character identifiers.
Each immutable revision gets its own globally unique `assignmentId`; the report
ID and revision number remain separate logical fields.

| Stored outside encryption | Stored inside the encrypted report |
|---|---|
| Report ID, revision, assignment ID, recipient vendor ID | Domain `embargo.report.v1`, realm identity, same IDs and recipient |
| Stable researcher issuer + `sub`, creation time, status | Researcher identity context, title, severity, details and PoC |
| Ciphertext, signed write/read grants, policy fingerprints | Any other sensitive descriptive content |

Title and severity are not required for routing; do not leave them plaintext.
Researcher and recipient metadata, status, timing, ciphertext length and access
patterns remain visible. Do not claim anonymity or a metadata-free database.

Bind record access using the signed policy's `assignmentId` and recipient subject.
Validate the exact intended policy fields from trusted setup/approval context before
encrypting. After authenticated decryption, validate the strict payload schema and
compare domain, realm, report, revision, assignment and recipient context with the
requested report before displaying anything. Reject missing, unknown-version,
type-confused or mismatched context.

This is an application context check, not an invented AAD argument: the documented
SDK item shape is `{ data, tags }`. If a supported API offers AAD, use its documented
binding; do not assume it exists. An unkeyed hash supplied by the same server does
not authenticate a recipient, policy or report. Context checks after decryption also
do not undo disclosure caused by an overbroad valid policy.

Authenticated encryption does not prove researcher authorship to a hostile-server
recipient. The API records an authenticated submitter under the honest-server model;
independently verifiable signed submissions/receipts would be a separate protocol.

## API and session rules (implemented, runtime-unverified)

All API handlers verify credentials themselves; page guards are only navigation UX.
The primary credential is the bearer access token obtained from the authenticated
SDK (`getToken()`). `server/auth.mjs` builds a local JWKS from the adapter's public
`jwk`, pins EdDSA, requires `iss`, intended API `aud`, `azp`, non-empty `sub` and a
finite `exp`, and extracts roles from the verified payload only. There is no remote
JWKS lookup and no token-selected key URL. `azp` identifies the requesting client
and is not a substitute for audience. No signed token from a real Tide realm has
been used against this code.

The template installs no server verifier; this repository adds pinned `jose`
6.2.13. That verifier's behaviour against real Tide tokens remains unexercised.
Ownership is keyed by `(iss, sub)`, not mutable display names. DPoP is opt-in in
this SDK baseline; the local API accepts bearer credentials and does not claim token
replay immunity.

Browser writes require an `Origin` matching `APP_ORIGIN` (or
`Sec-Fetch-Site: same-origin`); there is no cookie-auth fallback. JSON bodies are
capped at 1 MiB, ciphertext at 512 KiB of base64 text, policy/pending-request blobs
at 128 KiB, and body keys are exact. These controls are coded, not observed under
load.

| Route (implemented local) | Server-side behaviour |
|---|---|
| `GET /api/health` | Process/database readiness; no secrets |
| `GET /api/setup` | Config diagnostics and allowlisted public adapter when valid; `configured:false` otherwise |
| `POST /api/drafts` | Researcher with verified `tideuserkey`; server creates full-UUID context |
| `GET /api/drafts`, `GET /api/drafts/:assignmentId` | Admin all/owner own; pending request bytes hidden from owners |
| `PUT /api/drafts/:assignmentId/policies` | Admin; structural signed-policy check and optimistic version; locked after submission |
| `PUT /api/drafts/:assignmentId/requests` | Admin; exact bounded request bytes; no vote counting |
| `GET /api/admin/policy` | Admin; relays reserved `tide-realm-admin` read with the caller's bearer |
| `POST /api/reports` | Owner/researcher; both stored policies rechecked; atomic insert/audit; duplicates conflict |
| `GET /api/reports?vendorId=...` | Matching realm vendor role; stored ciphertext envelopes only |
| `GET /api/reports/mine` | Verified `(iss, sub)` metadata only; no ciphertext or grants |
| `PATCH /api/reports/:assignmentId` | Matching vendor; `received -> triaged -> fixed` with expected version |
| `GET /api/operator/raw` | Operator; ciphertext, disclosed metadata and local activity marked `tamperproof:false` |

SQL uses parameter binding, unique constraints and transactions. Reject duplicate
revision inserts; use expected-version updates to prevent stale status changes.
Return a clear conflict instead of overwriting ciphertext. Database corruption,
permission failures and missing migrations must surface, not reset to an empty store.
These controls stop application races, not a storage owner's rollback or deletion.
The local backend holds no Tide signing key, exposes no fake-login mode, counts no
approval votes in place of a cryptographic result, and stores no plaintext report
field. Those are code-level absences, not live-network evidence.

Development topology: Vite on `http://localhost:5137` proxies `/api` to the API on
`127.0.0.1:3001`. The browser origin, and therefore OIDC callback/web-origin
matching, stays `http://localhost:5137`; do not silently switch the browser to
`127.0.0.1`. Bind the API to loopback for development. In production, missing
`/api/*` routes and missing JSON configuration must return errors, never the SPA
`index.html`; the observed `Unexpected token '<'` parse error is the failure mode
to avoid.

## Client, errors and revocation

- Render PoC/report text as escaped text, never executable HTML. Do not execute
  submitted exploit code or enable unsafe Markdown rendering.
- Keep plaintext out of logs, analytics, error reports, URLs, `localStorage`,
  caches and server-rendered output. Use `Cache-Control: no-store` for sensitive
  responses.
- Avoid third-party scripts on report pages. Use a CSP that actually permits the
  configured Tide authentication frames and callback origin, without a blanket
  wildcard; exercise the login flow after tightening it. JavaScript memory clearing
  is best effort, not secure erasure.
- Distinguish policy/access refusal from expired login, malformed/corrupted data and
  network failure. Preserve safe diagnostic causes without logging contents or tokens.
  A generic threshold error may represent denial; inspect the supported error cause.
- `refreshToken()` calls the SDK's update-if-needed path; `forceRefreshToken()`
  forces renewal. Do not describe `refreshToken()` as guaranteed forced renewal.
  Measure old credentials, refreshed credentials and expired credentials separately.
  A compliant UI refresh does not constrain a hostile client. Record the observed
  enforcement bound, including token/doken and policy expiry.
- Saved plaintext or previously obtained usable keys cannot be clawed back. No
  server-side revocation can retract a ciphertext a recipient already decrypted.

## Evidence and non-goals

A local activity table is not append-only evidence against the operator. A hash
chain kept entirely by that operator can be rewritten or truncated with the database.
Do not claim tamper-proof audit, censorship resistance, trusted timestamps, rollback
resistance, legal protection or secure public disclosure.

Acceptance requires real authorised-success and unauthorised-failure checks on the
same ciphertext, alternate-policy attempts, tamper/context checks, credential tests,
transactional state tests and measured revocation; see the implementation plan.
Behavioural `node:test` suites exist for local verification, limits, ownership,
policy structure, transactional state and static fallback, but the coordinator has
not run them. No local test can substitute for a real-network decryption or
replacement-policy result.

## Security rationale and sources

Local KB links are research inputs, not proof that Tide implements a property.

| CryptoBC-KB guidance | Application here |
|---|---|
| [Threat modeling](../../CryptoBC-KB/kb/crypto/cbc-threat-modeling.md) | Separate database theft, hostile server, endpoint and quorum threats |
| [MAC and AEAD](../../CryptoBC-KB/kb/crypto/cbc-mac-and-aead.md) | Require authenticated ciphertext; reject tampering before display |
| [Key management](../../CryptoBC-KB/kb/crypto/cbc-key-management.md) | Avoid context-free record/key substitution and server-held bypass keys |
| [JWT and OAuth](../../CryptoBC-KB/kb/crypto/cbc-jwt-and-oauth-pitfalls.md) | Pin algorithms, issuer, audience and key sources |
| [Transactional replay defenses](../../CryptoBC-KB/kb/crypto/cbc-koth-crypto.md) | Verify identity/context before atomic state commit; preserve replay state across restart |
| [Usage pitfalls](../../CryptoBC-KB/kb/crypto/cbc-crypto-usage-pitfalls.md) | No custom cipher, manual threshold signing or improvised key wrapping |

Primary integration sources:
- [Shared encryption playbook](https://github.com/tide-foundation/raziel-mcp/blob/master/playbooks/setup-forseti-e2ee.md)
- [Relationship policy implementation](https://github.com/tide-foundation/raziel-mcp/blob/master/templates/relationship-attestation/relationship.ts)
- [QEA workflow and master-realm boundary](https://docs.tide.org/Core-Concepts/iga-workflow)
- [Token verifier contract](https://github.com/tide-foundation/tidecloak-js/tree/main/packages/tidecloak-verify)
- Template files at the pinned commit:
  [`vite.config.js`](https://github.com/truongnguyenxuanvinh/hackathon/blob/82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0/vite.config.js),
  [`src/main.jsx`](https://github.com/truongnguyenxuanvinh/hackathon/blob/82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0/src/main.jsx),
  [`src/App.jsx`](https://github.com/truongnguyenxuanvinh/hackathon/blob/82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0/src/App.jsx)
