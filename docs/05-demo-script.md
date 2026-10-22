# 05 — Two-minute demo script

Target 1:55. Show **possibility → constraint → working prototype → what changes**.
This is a planned recording. The local Embargo app is implemented in the repository
but has not been built, launched or exercised; no shared-encryption, policy-signing
or authority check has been observed. A live Tide realm, adapter and enrolled
accounts were unavailable, so there is no demo recording or live evidence yet.

## Recording prerequisites

- Pass the shared-encryption and authority gates in
  [04-implementation-plan.md](04-implementation-plan.md), including alternate-policy
  signing. Do not record a no-unilateral-access claim based only on a pending role.
- Prepare separate researcher, vendor, operator and independent-approver sessions.
  Disclose whether accounts are controlled by separate people or organisations.
- Use a synthetic Kettle report and an Acme control report, each with its own signed
  revision grants. Never show credentials, enrolment URLs or tokens.
- Keep actual success/denial evidence and version details available in the repo.
  A red banner alone is not cryptographic proof; operational failures must not be
  relabelled as access refusals.

### Do not use as evidence

- The template's role/persona switcher or locally simulated 2-of-3 "APPROVED" state.
- The template's canned "Attempt both overrides" blocked events.
- The template's existing `Video.mp4`: its contents were not reviewed, and it is not our Embargo recording.
- A screenshot of a pending role grant as proof that alternate-policy issuance is
  governed.

If the supplied template appears at all, label it explicitly as the FairEnrol
simulation and keep it out of any Embargo security claim.

## Script

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:15 | Researcher starts a fictional Kettle disclosure | "Linh found a sensitive bug. She needs Kettle's team to investigate it, without handing its contents to another storage operator." |
| 0:15–0:30 | Researcher → exchange → vendor | "If the exchange can read reports or rewrite who may read them, the middleman is still a point of trust." |
| 0:30–0:50 | Select reviewed vendor grant; encrypt and submit | "Embargo uses TideCloak's shared encryption and a signed policy for this report revision. The title and report contents leave the browser encrypted." |
| 0:50–1:10 | Sam decrypts the stored ciphertext and acknowledges the report; Linh sees progress | "The intended vendor opens the report and starts triage. The researcher gets a response without the exchange reading the contents." |
| 1:10–1:25 | Operator view: ciphertext plus disclosed routing metadata; actual unauthorised attempt | "Max operates storage. He can see routing metadata, but this session is not authorised to decrypt the report." |
| 1:25–1:45 | Max's role grant stays pending; show recorded alternate-policy check and legitimate quorum result | "A lone admin cannot activate a self-grant. We also check the other route: issuing a replacement read policy. Authority requires the configured independent approvals." |
| 1:45–1:55 | Closing: useful exchange, bounded authority, explicit assumptions | "The exchange coordinates disclosure without holding routine access to report contents. This demo assumes trusted client code; it does not promise anonymity, guaranteed delivery or erasure of saved copies." |

Use only statements substantiated by the exercised integration. A legitimate,
quorum-approved grant may intentionally expand access; that is governed sharing,
not proof that permissions can never change. If a required gate fails, report the
unresolved result and do not claim the required protection or a complete prototype.

## Capture and submission

- Record at a readable resolution, close unrelated windows and use synthetic text.
- Name TideCloak's role explicitly: shared encryption, policy enforcement and governance.
- Compress if needed:
  `ffmpeg -i raw.mkv -vf scale=1280:-2 -c:v libx264 -crf 28 -c:a aac -b:a 96k demo.mp4`
- Check the final MP4 duration with `ffprobe demo.mp4` and its byte size before
  committing. The requirements are at most two minutes and under 100 MB.
