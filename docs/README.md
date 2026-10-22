# Embargo — project docs

**Embargo** is a confidential researcher-to-vendor disclosure exchange.
The local code targets encrypted report contents and no unilateral access grants,
including through replacement policies. **These are unverified requirements, not
implemented security guarantees.** Routing metadata remains visible.

This is our entry for **UNLOCKED: Challenge 2 of the RMIT hackathon (Tide, 2026)**.

> **Deadline: Thu 22 Oct 2026, 6:00 pm Vietnam time** (Melbourne: Fri 23 Oct, 10:00 am AEDT).
> Submit through the Google Form: https://forms.gle/HRHYjnqB86j1LFS97

## What exists today

Three states are kept separate: code present in this repository, a runtime we have
not yet observed, and live-network security evidence we do not have.

| Surface | State | Basis |
|---|---|---|
| Local application | **Implemented, not runtime-verified** | React/Vite frontend under `src/`, Node 24 API and SQLite repository under `server/`, shared contracts under `shared/`, `node:test` suites under `tests/`, `scripts/dev-all.mjs`; the coordinator has not yet built, launched or exercised the assembled app |
| Automated tests | **Written, not executed** | Behavioural suites exist; no test run, pass count or coverage claim is recorded here |
| Unconfigured setup behaviour | **Coded, not observed** | Setup diagnostics and `503 CONFIG_MISSING` paths exist; no browser or API smoke run has been recorded |
| Live Tide integration | **Not exercised** | No reachable Tide realm, adapter, enrolled accounts or ORK call was available |
| Shared encryption / no-unilateral-access proof | **Requirement only** | No live encrypt/decrypt, policy signature or replacement-policy result |
| Supplied template | Runnable FairEnrol baseline (historical) | Coordinator's isolated-clone checks, summarised below |

Do not read the presence of code, tests or scripts as evidence that any of it
works. The local API enforces token, origin, size and ownership checks by design,
but those checks have not been exercised against the assembled app. Live Tide
gates remain acceptance requirements, not completed work.

The supplied baseline is
[`truongnguyenxuanvinh/hackathon`](https://github.com/truongnguyenxuanvinh/hackathon)
at commit [`82717cf`](https://github.com/truongnguyenxuanvinh/hackathon/tree/82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0)
(full: `82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0`). It is a Vite + React
course-registration demo named **FairEnrol**. FairEnrol is the template's demo
domain, not our product; nothing in it should be presented as Embargo functionality.

Coordinator's verification in an isolated, unmodified clone (2026-10-22): `npm ci
--ignore-scripts` installed 69 packages; `npm run build` succeeded (Vite 6.4.4,
133 transformed modules, 1.38 s); `npm run dev` served
`http://localhost:5137/`; a browser rendered the page without
`public/tidecloak.json` or a Tide server, showing an initialisation/JSON parse
error rather than a login. Login, authorisation and encryption were **not**
exercised. The documentation author did not run these commands.

The template has no backend, API router, database, server-side token verification,
encryption call or policy-signing business flow. It is a frontend/auth starting
point, not a working Embargo prototype.

## Read in this order

| # | Doc | What it covers |
|---|-----|----------------|
| 1 | [01-challenge-requirements.md](01-challenge-requirements.md) | What Tide asks for, judging weights, submission checklist, what the template does not prove |
| 2 | [02-product-spec.md](02-product-spec.md) | Embargo's product, users, stories, scope, what we will *not* build |
| 3 | [03-architecture.md](03-architecture.md) | Template baseline, current local stack, threat model, policy/record binding, API and storage controls, and what remains unverified |
| 4 | [04-implementation-plan.md](04-implementation-plan.md) | Template baseline, implemented-local-app status, shared-encryption and governance acceptance gates, scenarios |
| 5 | [05-demo-script.md](05-demo-script.md) | The planned 2-minute video, shot by shot; no recording exists |
| 6 | [06-readme-draft.md](06-readme-draft.md) | Draft README "Project overview" (≤300 words, in Tide's template); setup stays in the root README |
| 7 | [07-tidecloak-reference.md](07-tidecloak-reference.md) | Locked SDK facts for the pinned versions, policy notes, and what remains unverified |

## One-paragraph pitch

Server-decrypting disclosure systems require trust in whoever controls decryption
and recipient permissions. Embargo's design uses TideCloak shared encryption so
researchers and vendors can coordinate without routine platform access to report
contents. Signed record-specific policies and governed authority changes must
prevent a lone administrator manufacturing access. The decisive checks include
alternate-policy issuance, not only a pending role grant. The design assumes
trusted client code and independent governance participants; it does not guarantee
delivery, anonymity, rollback resistance or erasure of recipients' saved copies.

The security revision draws on the sibling `CryptoBC-KB` repository. Its relevant
notes and the Tide primary sources are linked from the architecture document.
