# 02 — Product spec: Embargo

> **Embargo:** a confidential researcher-to-vendor disclosure exchange.
> Route the report without making its contents readable to the storage operator.

## Status and security claim

This is a design and a local implementation in progress, not a deployed or verified
security guarantee. The repository now contains a React/Vite frontend, a Node API
with SQLite storage, shared contracts and behavioural tests; the coordinator has not
yet assembled, launched or exercised them. A live Tide realm, adapter, enrolled
accounts and ORK policy/decryption path were unavailable, so no live Tide result is
claimed. The supplied starting template is a FairEnrol demo, not Embargo and not a
security implementation. The integration gates in
[04-implementation-plan.md](04-implementation-plan.md) must pass before the README
or video describes the target protections as working.

The target claim is: **an authorised vendor can decrypt a report, while a lone
realm administrator cannot manufacture access by changing roles or signing a new
access policy.** Both paths matter; a pending role grant proves only one of them.
Neither path has live evidence.

## The possibility

Independent researchers submit sensitive findings to a selected vendor through a
third-party exchange. The vendor acknowledges and triages the report; the researcher
sees progress without the exchange needing plaintext report contents.

In a conventional server-decrypting design, storage operators or sufficiently
privileged administrators may obtain unpatched findings. Disk encryption does not
remove this risk if the same operator can obtain decryption authority. This is an
architectural comparison, not a claim about every existing disclosure platform.

## What TideCloak must change

| Constraint | Target protection | Limit |
|---|---|---|
| Server receives report contents | Browser uses policy-governed shared encryption | Assumes authentic, uncompromised client code |
| One admin appoints themselves a recipient | Governed role changes and protected issuance of replacement policies | Requires real checks of both paths |
| Vendor gets another vendor's ciphertext | Network checks a signed, record-specific recipient policy | API filtering alone is insufficient |
| Database is copied | Titles, severity, details and PoC remain encrypted | Routing identities, status, timing and sizes remain visible |
| An analyst leaves | Governed role removal bounds future authorised operations | No erasure of saved plaintext; stale credentials need measurement |

## Starting point: the supplied template

The reviewed upstream starting point is the Vite + React **FairEnrol** template at
commit `82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0`. It was the baseline for this
repository; its historical observations below remain labelled as template behaviour,
not Embargo behaviour.
Its demo already states in the UI that
the role switcher and 2-of-3 exception flow are local simulations, not Tide-enforced
authorisation; that disclosure is honest and should not be mistaken for a hidden
security promise. One browser can act as both simulated approvers while not signed
in, the "Attempt both overrides" button dispatches canned blocked events, and state
resets on reload. The template has no backend, encryption call or policy signing.

We reused its application shell, CSS, TideCloak provider, callback and silent-SSO
helper. The local repository replaces its FairEnrol domain UI, persona switcher,
reducer approvals, in-memory public audit and course seed data with Embargo views,
a persistent transactional API and shared-encryption policy plumbing. No
compatibility shim or simulated approval counter stands in for cryptographic
governance. The replacement is code, not observed runtime: it has not been built,
launched or exercised, and no live Tide request exists.

## Framing: not a security tool

The challenge warns against a login demo or security dashboard. Lead with the
researcher-to-vendor workflow, not the administration console. Calling this a
marketplace is not a substitute for demonstrating value; real payments and
marketplace discovery are not part of this prototype.

Use synthetic findings and fictional vendors only. Encryption does not provide
legal safe harbour, guaranteed payment, anonymity, guaranteed delivery, or proof
that a vendor fixed a bug.

## Users (all synthetic)

| Persona | App role | Access |
|---|---|---|
| Linh, researcher | `researcher` | Write policy for the selected draft report; see own submission status |
| Sam, Kettle Health analyst | `vendor-kettle` | Read policy for Kettle reports |
| Jo, Acme Bank analyst | `vendor-acme` | Read policy for Acme reports |
| Max, operator/admin | `operator`, `tide-realm-admin` | Operate storage; one of three governance participants |
| Admins 2 and 3 | `tide-realm-admin` | Independently held governance identities |
| Alex, departing analyst | `vendor-kettle` initially | Used to measure future-access revocation |

Realm-role flags and the template's "view as" selector are display hints, never
API authorisation. Three accounts controlled by one person or organisation do not
demonstrate independent governance. The prototype must disclose who controls the
signers.

## Must have

1. **Submit:** Linh selects a vendor and encrypts title, severity, details and PoC
   in the browser using a signed policy bound to a unique report revision. The
   server stores ciphertext and minimum routing metadata.
2. **Triage:** Sam decrypts Kettle's report and acknowledges it. Jo cannot decrypt
   the same ciphertext, even when given the ciphertext and relevant policy bytes.
3. **Operator view:** Max sees ciphertext and disclosed metadata, not report
   contents. A failed operation is classified honestly, not always as access denial.
4. **No unilateral grant:** Max cannot activate a self-granted vendor role or issue
   a usable replacement policy granting himself access to the existing report.
   Independent approvals enable a legitimate change.
5. **Context integrity:** Swapping report IDs, recipient metadata, revision
   context, signed policies or ciphertext cannot silently display a mismatched report.
6. **Future revocation:** Measure the interval until Alex's old and refreshed
   credentials cease to authorise a fresh decryption. Do not promise immediate erasure.

## Optional, after the security gates

- A local activity page, explicitly not a tamper-proof audit trail.
- A mock bounty record, explicitly not payment or escrow.
- Researcher read-back through an explicit read grant, not a blanket decrypt role.

## Out of scope and residual risks

- Real payments, real vulnerability data, CVE feeds, large attachments, automatic
  public disclosure, and custom cryptographic contracts.
- Protection against authorised recipients copying plaintext, compromised user
  endpoints, maliciously replaced frontend code, a colluding admin quorum, or a
  compromised threshold of Tide nodes.
- Availability, censorship resistance, database rollback resistance and
  independently verifiable researcher authorship. The operator can withhold or
  delete data. These are not solved by ciphertext or a server-maintained hash chain.

See [03-architecture.md](03-architecture.md) for the threat model, KB rationale,
data model, authority boundaries and required negative scenarios.
