# 01 — Challenge requirements

Source: https://tide.org/unlocked (including its `config.js`, which holds the judging
criteria, README prompts and FAQ). Checked 2026-10-22.

## The brief

> *What would you build if trust stopped being the bottleneck?*
>
> Bring a working prototype with TideCloak integrated. Demonstrate one new
> possibility and explain why removing unilateral control makes it possible.

- **Small but working**, with **TideCloak integrated**. "A finished product isn't expected."
- Use **synthetic data and mocked systems** (payment rails, record systems and so on).
- No cybersecurity or cryptography experience is required. AI coding tools are the intended workflow.
- Tide's MCP server ("Raziel", `https://mcp.tide.org/mcp`) is optional. Plan B is the TideCloak Quickstart template.

### The two rules that matter most

1. *"If your app would work exactly the same with ordinary login and backend
   permissions, develop the idea further. TideCloak should change what it can
   credibly do."*
2. **What to avoid (FAQ):** *"Don't make the project mainly a login demo, a security
   tool or a generic access-control dashboard. Show what becomes newly possible for
   the people using it."*

> Embargo is in the security domain, so this is a genuine product risk.
> Demonstrate the researcher submitting, the vendor responding and the researcher
> seeing progress; merely calling an access-control demo a marketplace is insufficient.
> See [02-product-spec.md § Framing](02-product-spec.md#framing-not-a-security-tool).

## What the supplied template is and is not

Our reviewed upstream starting point, and the baseline imported into this repository,
is
[`truongnguyenxuanvinh/hackathon`](https://github.com/truongnguyenxuanvinh/hackathon)
at commit `82717cfa6f4c38ba71dd9f7fd4b86802dbe124b0`. It is a Vite + React
frontend named **FairEnrol** with a TideCloak login shell. The observations below
describe that template, not the Embargo code now present in `src/` and `server/`.
The local Embargo application is implemented but has not been built, launched or
tested in integration, and no live Tide call has been made.

- **It provides:** React entry point, TideCloak provider and callback path,
  `public/silent-check-sso.html`, bundled CSS, synthetic course data and a
  `public/tidecloak.json` (gitignored) adapter convention. The coordinator's
  isolated clone built and served on `http://localhost:5137/`.
- **It does not provide:** any backend, API, database, server-side credential
  verification, encryption call, signed-policy flow or durable multi-user state.
  The role/persona switcher and 2-of-3 approvals are local simulations.
- **It therefore does not satisfy** the "TideCloak changes what the app can credibly
  do" test, and its `Video.mp4` is a FairEnrol artifact, not evidence for Embargo.

Treat the template as scaffolding to reproduce and replace, not as a solved
integration. The integration gates live in
[04-implementation-plan.md](04-implementation-plan.md).

## Judging criteria (weights from the page)

| Weight | Criterion | What judges look for | README prompt |
|---:|---|---|---|
| **25%** | Vision & originality | A fresh, ambitious answer to the challenge. | What new product, service, experience or way of working are you proposing? What makes your idea distinctive? |
| **20%** | Trust constraint insight | Show exactly what trust, privacy, custody or authority prevents today. | What is difficult, risky or impossible today because trust, privacy or security gets in the way? Explain what becomes possible when that constraint is removed. |
| **20%** | Value & impact | Create meaningful value for people, organisations or society. | Who would benefit, and how would their lives or work improve? Give a concrete example of why this matters. |
| **20%** | Why TideCloak matters | Show how TideCloak materially changes what your product can credibly do. | How does your application use TideCloak, and how does that integration help enable your idea? Connect the technology to the possibility you are demonstrating. |
| **15%** | Prototype & storytelling | Make the idea understandable and show it working. | What does your prototype demonstrate today? Describe the key interaction judges should look for. |

Judges read the README alongside the demo. Reserve time for both, but do not treat
the other criteria as independent of a working integration. The prototype must
substantiate its claims about shared encryption and removal of unilateral authority.
A template simulation does not satisfy the trust-removal requirement.

## What to submit

Two things, both in a **public GitHub repository**. Submit the repo link through the
**Google Form: https://forms.gle/HRHYjnqB86j1LFS97**

### 1. Repository
- Prototype code with TideCloak integrated.
- `README.md` that **starts with** the Project overview template (below):
  - a one-sentence description, then answers to the **five prompts**;
  - **≤ 300 words**;
  - setup instructions in a separate `## Setup` section after it.

### 2. Two-minute demo video
- **`.mp4` in the repo, under 100 MB** (GitHub's file limit).
- Suggested structure: **1) The possibility, 2) The constraint, 3) The prototype**
  ("show it working, and TideCloak's role"), **4) What changes**.

### Official README template (exact output of the page's "Copy" button)

```markdown
[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

## Project overview

_One-sentence description of your project._

Built with [TideCloak](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked).

### 1. Vision & originality

<!-- What new product, service, experience or way of working are you proposing? What makes your idea distinctive? -->

### 2. Trust constraint insight

<!-- What is difficult, risky or impossible today because trust, privacy or security gets in the way? Explain what becomes possible when that constraint is removed. -->

### 3. Value & impact

<!-- Who would benefit, and how would their lives or work improve? Give a concrete example of why this matters. -->

### 4. Why TideCloak matters

<!-- How does your application use TideCloak, and how does that integration help enable your idea? Connect the technology to the possibility you are demonstrating. -->

### 5. Prototype & storytelling

<!-- What does your prototype demonstrate today? Describe the key interaction judges should look for. -->

## Setup

<!-- How to install and run the prototype. -->
```

Our filled-in draft is in [06-readme-draft.md](06-readme-draft.md).

## Deadlines

| City | Deadline |
|---|---|
| Melbourne | Fri 23 Oct 2026, 10:00 am AEDT |
| **Vietnam** | **Thu 22 Oct 2026, 6:00 pm (UTC+7)** ← ours |
| Malaysia | Thu 22 Oct 2026, 6:00 pm (UTC+8) |

The challenge page is script-driven. A static fetch can contain a hidden
"Submissions have closed" element regardless of the live countdown, so we do not
treat that as current submission state. The published config gives 18:00 +07:00 on
22 Oct 2026; keep that as the external deadline requirement. Confirm on Discord if
the actual state is unclear.

## Submission checklist

- [ ] Repo is **public**
- [ ] TideCloak shared encryption works across real researcher/vendor accounts; unauthorised controls receive the same ciphertext and are refused
- [ ] Only synthetic data. No real CVEs, companies or people.
- [ ] README begins with the template, ≤ 300 words, all five prompts answered
- [ ] `## Setup` section works from a clean clone
- [ ] `demo.mp4` committed, ≤ 2:00, < 100 MB
- [ ] Evidence covers governed role changes and alternate-policy issuance, not only a refusal banner or pending self-grant
- [ ] No session material, enrolment links, private credentials or runtime databases committed; dev defaults are explicitly loopback-only
- [ ] The template's `Video.mp4`, role switcher and locally simulated approvals are **not** reused as Embargo evidence
- [ ] Google Form submitted **before 17:30** (30-minute buffer)

## Help

- Discord (#support): https://discord.gg/XBMd9ny2q5
- Hackbot: chat widget on the challenge page ("Pressure-test our idea")
- Docs: https://docs.tide.org/
- Walkthrough video (MCP + Claude Code): https://youtu.be/z0o-B3258Cg
- Launch video: https://youtu.be/gHlev6-kB3I
- Emergent Authority explainer: https://tide.org/blog/emergent-authority-beyond-cybersecurity
