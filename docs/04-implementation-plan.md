# 04 — Implementation plan and acceptance gates

Submission deadline: **18:00 Vietnam time**, target **submitted by 17:30**.
Follow the phases in order. Enrolment, policy signing and governance checks have
unknown duration; do not assume they fit a fixed slot.

**Status:** mixed. The pinned template baseline was reproduced and imported. The
local Embargo application, shared contracts, API, repository and test suites are
written, but the coordinator has not yet installed, built, launched or run them
together, and no browser/API smoke result exists. No live Tide login, encryption,
decryption or policy signature has been exercised. Phases 3–5 and the live-network
parts of Phase 7 remain acceptance gates, not completed work.

## Phase 1 — Reproduce the pinned template exactly (baseline; completed)

The starting point is commit `82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0`
(`82717cf`) of
[`truongnguyenxuanvinh/hackathon`](https://github.com/truongnguyenxuanvinh/hackathon).
It is a Vite + React frontend, not a Next.js scaffold and not an Embargo app.

```bash
git clone https://github.com/truongnguyenxuanvinh/hackathon.git
cd hackathon
git checkout 82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0
npm ci
npm run build
npm run dev
# open http://localhost:5137/
```

The coordinator performed this in an isolated clone on 2026-10-22, with one review
deviation: `npm ci --ignore-scripts` installed 69 packages because install scripts
were intentionally disabled for review. `public/silent-check-sso.html` is already
committed, so the disabled scripts did not remove a needed helper. A normal clone
should use `npm ci` (or the upstream README's `npm install`) with scripts enabled;
record any script behaviour. `npm run build` succeeded unchanged (Vite 6.4.4, 133
transformed modules, 1.38 s). `npm run dev` served `http://localhost:5137/`.

Expectations and limits:

- The dev URL is **`http://localhost:5137/`**, not `5173` as the template README
  says. `strictPort` means the server fails rather than moving ports.
- `public/tidecloak.json` is absent and gitignored. The page still renders, but the
  provider reports a JSON parse error because Vite's SPA fallback answers the
  missing config with `index.html` (`Unexpected token '<'`). Do not treat this as a
  login result.
- The build proves bundling only. It does not prove Tide login, authorisation or
  encryption.
- The template has no `npm run init`, server, test or migration script. Do not
  invent them as existing commands.

## Phase 2 — Import the template without overwriting these docs (completed)

The template's runnable files were imported: `index.html`, `package.json`,
`package-lock.json`, `vite.config.js`, `src/`, `public/`, while `docs/` was
preserved. The template `README.md` and `Video.mp4` were not carried over as
Embargo deliverables or evidence. Current layout:

```
index.html, vite.config.js, package.json, package-lock.json, compose.yaml
public/silent-check-sso.html, public/tidecloak.json (gitignored)
src/        React app (shell/reuse; FairEnrol workflow replaced)
shared/     pure contracts: payload schema, status machine, context keys
server/     Node 24.21.0 ESM API + SQLite access
tests/      node:test behavioural suites
scripts/    dev-all.mjs (API + Vite)
docs/       these documents
```

The template's provider entry point, `/auth/redirect` handling and silent-SSO
helper are retained. The local `src/main.jsx` fetches `/api/setup` and passes the
returned public adapter as `config`; it does not use the template's static
`configUrl="/tidecloak.json"` fetch. Vite remains on port 5137. The imported
application has not been built or launched, so the import is a file-level fact, not
a runtime result.

## Phase 3 — Manual Tide environment and login (not exercised)

The root [README](../README.md#live-tide-setup) is the current setup reference. The
optional `compose.yaml` runs the TideCloak development container bound to
`127.0.0.1:8080` and requires externally supplied admin credentials; it is not
started automatically. The template README's manual container instructions are the
historical baseline for that convention.

```bash
export TIDECLOAK_ADMIN_USERNAME='...'
export TIDECLOAK_ADMIN_PASSWORD='...'
docker compose up
```

1. Open `http://localhost:8080/` and complete realm/app setup. For the 5137 dev
   origin, register the default login callback
   `http://localhost:5137/auth/redirect` and silent-SSO callback
   `http://localhost:5137/silent-check-sso.html`. The SDK also defaults logout's
   return URI to `/auth/redirect`; configure allowed post-logout redirects accordingly.
   Set the web origin to `http://localhost:5137` (origin only, no callback path).
   If the exported adapter overrides `redirectUri` or `silentCheckSsoRedirectUri`,
   register those exact values instead. Do not substitute `127.0.0.1` for
   `localhost`: OIDC origin matching is literal.
2. Download the adapter JSON to `public/tidecloak.json`. It is public client
   metadata, **never** a client secret or admin credential. It is gitignored.
3. Run `npm run migrate` once, then `npm run dev:all`, and click "Log in with
   TideCloak". This is the first real login check; the coordinator could not
   perform it because Docker was denied and no Tide service existed at
   `localhost:8080` in the review environment. The local app has never been run.
4. With no valid adapter, the local `GET /api/setup` returns `configured:false` and
   the frontend should show the setup screen while protected APIs return
   `503 CONFIG_MISSING`. That coded behaviour has not been observed. The
   template's historical failure mode was a Vite SPA fallback serving `index.html`
   for the missing config, producing `Unexpected token '<'`; production hosting
   must still not serve HTML for missing config or API paths.

Record the container digest, actual SDK versions from `package-lock.json`, realm
name, app client and callback values. The bootstrap password is not a production
credential and the container must not be exposed publicly.

## Phase 4 — Prove real researcher-to-vendor shared encryption

Use [03-architecture.md](03-architecture.md#shared-encryption-use-the-correct-model)
and the official [shared encryption playbook](https://github.com/tide-foundation/raziel-mcp/blob/master/playbooks/setup-forseti-e2ee.md).

1. Confirm the target network supports `RelationshipAttestation:1`. Pin the
   compatible SDK and use its documented policy serialization and signing calls.
2. Create the app roles and fixed `_tide_encryptor` / `_tide_decryptor` operation
   roles. Complete required QEA approvals and Tide account linking.
3. Prepare one opaque draft revision `assignmentId`. Sign a researcher write grant
   and a Kettle-role read grant for that exact ID; store the signed bytes.
4. Encrypt a synthetic report as Linh with the signed write policy. In the pinned
   `@tidecloak/react` 0.14.33, `doEncrypt`/`doDecrypt` accept and forward policy
   bytes. Gate on initialisation: the wrappers return `null` before the provider is
   ready. Direct `IAMService.doEncrypt` / `IAMService.doDecrypt` are another
   policy-aware API. React's request initialisation/approval/execution helpers are
   for signing policies, not substitutes for encryption/decryption.
5. Decrypt the **same ciphertext** as Sam using the signed read policy.
6. Supply the ciphertext and policies to Jo and Max, including operation-role
   holders without the matching recipient subject. Invoke the real supported
   decrypt path directly, without API-list filtering or a hidden button.
7. Distinguish local SDK prechecks, network refusal and unrelated failures in the
   evidence. Keep SDK error causes safely; never log plaintext or credentials.

**Exit:** positive control succeeds and unauthorised controls fail for the intended
reason. If shared signing is unavailable, resolve that with Tide. No same-tag,
shared-account, self-encryption or API-only fallback meets the requirement.

## Phase 5 — Prove the authority boundary

Complete the three independently controlled admin enrolments before accepting
sensitive data. Confirm the committed roster and effective **2-of-3** threshold.
Bootstrap is trusted setup, not evidence that one admin is harmless in production.

Use an operation-capable Max fixture: legitimately approve `_tide_decryptor` before
the test, but do not grant a matching vendor role or read policy. Keep the target
identity, assignment ID, ciphertext and intended recipient grant identical between
the one-admin attempt and two-admin positive control. The latter must actually
decrypt; otherwise the negative result does not isolate governance.

| Attempt | Required evidence |
|---|---|
| Max grants himself `vendor-kettle` | Pending below quorum; fresh credentials still cannot decrypt |
| Max signs another read policy naming himself for an existing assignment | One approval cannot produce usable unilateral access |
| Two distinct admins authorise the same intended grant/change for Max | The same identity decrypts the same ciphertext only through the supported governed path |
| Max changes composites/groups/scopes or removes admins | No unilateral effective route around the same requirement |
| A revoked analyst seeks a replacement grant | No unilateral regrant through policy signing |

For policy signing, distinguish a browser approving a request, a signature being
returned, and the network actually accepting decryption. A one-admin sample flow
does not establish multi-admin enforcement. If the gate fails, require Tide-supported
cryptographic enforcement; do not substitute an application approval counter.

**Current environment blocker:** three independently enrolled Tide accounts and a
reachable Tide service do not exist in the coordinator's review environment. Docker
socket access was denied and `sudo -n` required interactive authentication. These
gates cannot be marked passed without that infrastructure.

## Phase 6 — Implement the narrow product workflow (code present; unverified)

The local implementation exists under `src/`, `server/`, `shared/` and `tests/`.
The ordered controls below are the design those files are meant to implement; their
runtime behaviour has not been observed.

Backend runtime is **our** choice: Node 24.21.0, which is available and supports
`node:sqlite`. It is not a template requirement; the template declares no engine and
ships no server. Keep native ESM and avoid a framework migration (no Next.js).

Script status in this repository (written, not executed by the coordinator):

| Command | Status | Purpose |
|---|---|---|
| `npm run dev` | Present | Vite frontend on `http://localhost:5137` |
| `npm run dev:api` | Present | Node API on `127.0.0.1:3001` with `.env` if present |
| `npm run dev:all` | Present | Run Vite and the API together via `scripts/dev-all.mjs` |
| `npm test` | Present | `node --test tests/` behavioural suites |
| `npm run migrate` | Present | Create/upgrade the SQLite schema |
| `npm run build` | Present | Vite production build |
| `npm run start` | Present | Run the API and serve a built `dist/` |

There is no separate `test:api` script; API behaviour lives in `tests/`. The Vite
configuration proxies `/api` to `http://127.0.0.1:3001`. Keep the browser on
`http://localhost:5137`; the server-side proxy target does not change OIDC origin
matching. Bind the API to loopback in development. Production hosting must exclude
`.env`, `tidecloak-data/`, SQLite files and logs, while serving the reviewed
environment-specific **public** client configuration through the setup endpoint.
Never serve private/full credential files. Missing API/config paths must return
JSON/404 rather than SPA HTML. These script behaviours are defined in
`package.json`/`scripts/` and `server/`, not observed in a run.

Implemented control set (code present, not exercised):

1. **Contracts (`shared/`):** strict report payload schema, domain/realm/ID context
   keys, status transition table, bounded sizes. Full CSPRNG UUIDs only.
2. **Storage:** SQLite through `node:sqlite`; parameterised queries, immutable
   report revisions, unique `assignmentId`, transactions covering report/state
   writes plus activity. Duplicate submissions conflict; stale status updates use an
   expected version. Storage failures surface instead of returning an empty database.
3. **API identity:** every protected handler verifies the bearer token with pinned
   `jose`. Issuer/JWKS and signing algorithms are fixed; intended audience, client,
   expiry and stable `(iss, sub)` ownership are required. Browser writes require the
   configured origin; no cookie fallback is implemented.
4. **Input boundary:** request-size and schema limits, legal state transitions and
   matching vendor roles. Ciphertext schema checks are not verification of its
   encrypted contents.
5. **Submit:** a draft ID and reviewed signed grants precede encryption. Title,
   severity, details, PoC and the complete context envelope are encrypted in the
   browser. Only ciphertext, signed grants and disclosed routing metadata are posted.
6. **Inbox:** use the signed read policy, authenticate decryption, then compare
   domain/realm/report/revision/assignment/vendor context before rendering.
7. **Progress:** vendor acknowledges or triages; researcher sees their own status.
   A small explicit status machine.
8. **Operator:** ciphertext and disclosed metadata only. Event data is a local
   activity log; client-reported outcomes are untrusted.
9. **Browser:** escaped report text only; no PoC execution, unsafe Markdown, content
   telemetry or plaintext persistence. No third-party scripts on sensitive pages.
   `no-store` responses and a CSP covering the configured auth/ORK origins are coded;
   their live behaviour is unvalidated.

The FairEnrol course UI, persona switcher, reducer approval simulation, in-memory
audit and seed data are replaced outright. No compatibility shim makes simulated
approvals look like governance. Policy issuance remains a browser/enclave
operation, not a hidden server signing endpoint or a client-accessible admin
credential.

## Phase 7 — Exercise security and failure scenarios (not run)

Local `node:test` suites are written for verification, limits, origin checks,
ownership/vendor scoping, policy structure, optimistic versions, duplicate/
concurrent submission, status transitions, persistence and static/API fallback.
The coordinator has not run them, so none is a passing result. Use actual Tide
sessions for integration claims; mock SDK responses cannot prove policy
enforcement.

| Scenario | Expected result / observation |
|---|---|
| Authorised vendor, correct ciphertext and grant | Actual plaintext matches the submitted synthetic report |
| Wrong vendor / operator with ciphertext and grant | Refused independently of backend filtering |
| Tamper with ciphertext or signed policy | No unauthenticated/mismatched plaintext is displayed |
| Change assignment/tag or move ciphertext between records | Identify network/context rejection; no silent record substitution |
| Use a valid grant for a different assignment | Cannot open the original record under the wrong assignment |
| Use a quorum-authorised new recipient grant for the same assignment | Document intended access expansion; do not incorrectly label all new grants attacks |
| One-admin alternate recipient grant for that assignment, with operation-capable Max | No usable unilateral access; the equivalent two-admin grant decrypts the same ciphertext as Max |
| Alter vendor/revision/domain/realm metadata | Rejected before display against protected context |
| Correctly signed token with wrong/missing audience | API rejects it; valid intended-audience control succeeds |
| Wrong issuer/client/role, expired or missing-expiry token | Rejected by the relevant verification/claim check |
| Cross-origin cookie write / oversized body / unsafe report HTML | Rejected, bounded, or escaped as appropriate |
| Duplicate commit, concurrent submissions and stale status update | Unique insert/transaction/version rules hold after restart |
| Corrupt or inaccessible storage | Explicit failure; no silent reset |
| Analyst removal with old, refreshed and expired credentials | Measure future-access enforcement interval, not just UI refresh |
| Network outage or malformed ciphertext | Honest operational failure, not a fabricated access-denied success |

When testing audience, obtain a genuinely signed wrong-audience token. Editing a
signed token merely tests signature validation. Record network/SDK versions and the
precise boundary each test establishes.

## Phase 8 — Demo, reproducibility and submission (not done)

No clean-clone run, demo recording, MP4 or form submission has been completed.

- Seed synthetic data through the actual signed-policy browser flow; do not commit
  reusable admin sessions, credentials or a public developer bypass endpoint.
- Run from a clean clone using the pinned dependencies and recorded configuration.
  Include manual enrolment, signing and quorum steps in Setup.
- Record [05-demo-script.md](05-demo-script.md). Verify the final MP4 is at most
  two minutes and under 100 MB.
- Use [06-readme-draft.md](06-readme-draft.md) only after replacing design claims
  with observed results. Keep the overview at most 300 words.
- Keep secrets, `tidecloak-data/`, local SQLite files, session material,
  `node_modules/`, `dist/` and `public/tidecloak.json` out of the public repository.
- Submit the public repository link through the Google Form and retain confirmation.

Cut optional bounty/activity polish first. Do not cut shared-encryption, alternate
policy, recipient-isolation or honest-error checks to make a stronger-looking video.
No claim of anonymity, rollback resistance, tamper-proof audit, immediate erasure,
legal safe harbour or immunity to malicious client-code deployment is supported.
