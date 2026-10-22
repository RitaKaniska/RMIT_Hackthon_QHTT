# 06 — README Project overview (draft)

This is the submission overview draft, not a second install guide. The root
[README](../README.md) is the runnable setup reference. The block below describes
the implemented local design and clearly separates it from unverified runtime and
live Tide evidence. It must remain at most 300 words. Before publication, change
section 5 to the behaviours actually exercised and keep only claims supported by
recorded evidence.

```markdown
[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

## Project overview

_Embargo is a confidential disclosure exchange: researchers send sensitive findings to the vendor that can fix them, while the storage operator sees routing metadata but not report contents._

Built with [TideCloak](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked).

### 1. Vision & originality

A researcher submits a sensitive finding; the vendor investigates and acknowledges it. The exchange coordinates progress without requiring routine access to report contents. The repository contains a local React/Vite frontend, Node API, SQLite storage, shared contracts and tests; it is not a live deployment.

### 2. Trust constraint insight

Server-decrypting platforms expose report contents to whoever controls decryption authority. Ordinary permissions fail if one administrator can grant themselves access. Embargo targets both permission changes and issuance of replacement read policies.

### 3. Value & impact

Independent researchers and small vendors gain a confidential coordination channel. A fictional clinic-software flaw illustrates sharing enough to fix a problem without creating another plaintext repository.

### 4. Why TideCloak matters

The design uses signed, record-specific shared-encryption policies and quorum-governed authority. Self-encryption cannot share a report with another user. Recipient grants must be protected against unilateral policy issuance, not only unilateral role grants.

### 5. Prototype & storytelling

The local app implements encrypted-report submission, a vendor inbox and triage, researcher status, an operator ciphertext view and admin policy-request screens. It has not been built, launched or run against Tide; no live encrypt/decrypt, signature or quorum result is claimed. The planned demo pairs authorised decryption with wrong-vendor and operator refusals, context checks and governed grant attempts. Only observed results will be claimed.

The scope assumes authentic client code and independent governance participants. Routing metadata remains visible. Recipients can retain plaintext; delivery, rollback resistance and legal protection are not guaranteed.
```

## Setup section requirements

Setup lives in the root [README](../README.md). Do not restate or contradict its
commands here.

1. **State:** the local application code is present but has not been built,
   launched or integration-tested; a live Tide login, encryption, decryption,
   policy signature and replacement-policy result were not exercised.
2. **Prerequisites:** Node 24.21.0 for the API (our choice, not an upstream Vite
   requirement), and optionally Docker for the loopback `compose.yaml` TideCloak
   container. A configured Tide realm, public client, adapter and enrolled accounts
   are still required for live checks. `public/tidecloak.json` is public client
   metadata, never a secret.
3. **Tide setup:** register the exact `http://localhost:5137` web origin and
   `/auth/redirect` callback, download the public adapter, and create the documented
   realm roles and API audience. Missing configuration must produce setup
   diagnostics and `503 CONFIG_MISSING`, not a fabricated login.
4. **Local commands:** follow the root README for install, migration, development,
   test, build and start commands. Their presence in `package.json` is not evidence
   that they have run successfully.
5. **Realm and policy ceremony:** browser/enclave signing with the reserved
   `tide-realm-admin` policy; no server signing endpoint or service-account
   approval. Structural policy checks do not prove network acceptance.
6. **Evidence and limits:** report live authorised-success and unauthorised-failure
   results only when observed, including the same-ciphertext control, independently
   controlled admins, alternate-policy issuance and measured revocation. Three
   accounts under one actor do not demonstrate independence.
7. **Video:** the repository's two-minute `demo.mp4`, under 100 MB, recorded only
   from exercised behaviour.

Do not publish enrolment links, reusable credentials, session material or plaintext
reports. Do not commit `tidecloak-data/`, SQLite files, `.env` or
`public/tidecloak.json`. The local CryptoBC-KB is a research reference, not a
runtime dependency.
