import { useEffect, useMemo, useRef, useState } from "react";
import { useTideCloak } from "@tidecloak/react";
import { TideError } from "@tideorg/js";
import {
  DOMAIN,
  SEVERITIES,
  STATUSES,
  VENDORS,
  buildPlaintextReport,
} from "../../shared/contracts.mjs";
import {
  ErrorPanel,
  Field,
  LoadingBlock,
  MetaGrid,
  Notice,
  PolicyIssues,
  SectionHeading,
  TideFailurePanel,
} from "../components/ui.jsx";
import { ContextMeta } from "../components/reports.jsx";
import { ApiError } from "../lib/api.js";
import { useAsyncData } from "../lib/hooks.js";
import {
  PolicyValidationError,
  assertPolicyForGrant,
  base64ToBytes,
  encryptResultToCiphertext,
  expectedGrantForDraft,
  inspectPolicyForGrant,
} from "../lib/tide.js";
import { characterCount, formatTimestamp, shortId, vendorName } from "../lib/util.js";

const EMPTY_FORM = Object.freeze({ title: "", severity: "medium", details: "", poc: "" });

const SYNTHETIC_EXAMPLE = Object.freeze({
  title: "Synthetic example: demo portal accepts a replayed session refresh",
  severity: "medium",
  details:
    "Synthetic example only. This text describes a fictional prototype finding and no real system, organisation or person. A demo portal was observed accepting a refresh value after the session had been rotated, which would let an attacker extend access in the fictional scenario.",
  poc:
    "Synthetic, non-executable steps:\n1. Sign in to the fictional demo portal.\n2. Capture a refresh request in the test harness.\n3. Repeat the request after rotation and observe the fictional response.\n\nDo not run anything from this example against a real system.",
});

function grantReady(inspection, realmVendorId) {
  return Boolean(realmVendorId) && inspection && inspection.issues.length === 0;
}

function GrantReadiness({ kind, draft, realmVendorId, navigate }) {
  const label = kind === "write" ? "Researcher write grant" : "Vendor read grant";
  const policy = kind === "write" ? draft.writePolicy : draft.readPolicy;
  const expected = expectedGrantForDraft(kind, draft, realmVendorId);
  const inspection = policy ? inspectPolicyForGrant(policy, expected) : null;
  const ready = grantReady(inspection, realmVendorId);

  return (
    <article className="grant-card">
      <div className="grant-head">
        <div>
          <span className="eyebrow">{kind.toUpperCase()} GRANT</span>
          <h3>{label}</h3>
        </div>
        <span className={`pill pill-${policy ? (ready ? "positive" : "danger") : "attention"}`}>
          {policy ? (ready ? "Stored, matches" : "Stored, mismatch") : "Needed"}
        </span>
      </div>
      {!policy ? (
        <p className="muted">
          No signed {kind} policy is stored on this draft. The researcher cannot proceed until a realm
          administrator signs it for this exact assignment.
        </p>
      ) : inspection?.issues.length ? (
        <PolicyIssues issues={inspection.issues} />
      ) : (
        <MetaGrid
          items={[
            { label: "Subject", value: inspection.summary.subjectId, mono: true, spanAll: true },
            { label: "Record", value: inspection.summary.recordId, mono: true, spanAll: true },
            { label: "Roles", value: (inspection.summary.roles || []).join(", "), mono: true },
            {
              label: "Signature",
              value: `${inspection.summary.signatureBytes} bytes`,
            },
          ]}
        />
      )}
      {!policy && navigate ? (
        <button className="btn btn-ghost" type="button" onClick={() => navigate("/admin")}>
          Open policy signing
        </button>
      ) : null}
    </article>
  );
}

function DraftListItem({ draft, selected, onSelect }) {
  const submitted = Boolean(draft.submitted);
  return (
    <button
      className={`list-item ${selected ? "selected" : ""}`}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="list-item-top">
        <strong>{vendorName(draft.context?.vendorId)}</strong>
        <span className={`pill pill-${submitted ? "positive" : "neutral"}`}>
          {submitted ? "Submitted" : "Draft"}
        </span>
      </span>
      <span className="list-item-sub">
        revision {draft.context?.revision ?? "—"} · {formatTimestamp(draft.createdAt)}
      </span>
      <span className="list-item-id mono">{shortId(draft.context?.assignmentId, 10, 6)}</span>
    </button>
  );
}

export default function Researcher({ setup, identity, api, navigate }) {
  const { doEncrypt, isInitializing, getVendorId } = useTideCloak();
  const drafts = useAsyncData(() => api("/api/drafts"), `drafts:${identity.key}`);
  const [selectedId, setSelectedId] = useState(null);
  const pendingDraftRef = useRef(null);
  const [vendorId, setVendorId] = useState(VENDORS[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [phase, setPhase] = useState(null);
  const [failure, setFailure] = useState(null);
  const [submitted, setSubmitted] = useState(null);
  const realmVendorId = getVendorId();

  const draftList = Array.isArray(drafts.data?.drafts) ? drafts.data.drafts : [];

  useEffect(() => {
    if (draftList.length === 0) {
      if (drafts.status !== "loading" && selectedId !== null) setSelectedId(null);
      return;
    }
    if (
      pendingDraftRef.current &&
      draftList.some((draft) => draft.context?.assignmentId === pendingDraftRef.current)
    ) {
      pendingDraftRef.current = null;
    }
    if (draftList.some((draft) => draft.context?.assignmentId === selectedId)) return;
    if (pendingDraftRef.current) {
      if (drafts.status === "error") pendingDraftRef.current = null;
      else return;
    }
    setSelectedId(draftList[0].context.assignmentId);
  }, [draftList, drafts.status, selectedId]);

  useEffect(() => {
    setForm(EMPTY_FORM);
    setFailure(null);
    setSubmitted(null);
    setPhase(null);
  }, [selectedId]);

  const selected = useMemo(
    () => draftList.find((draft) => draft.context?.assignmentId === selectedId) ?? null,
    [draftList, selectedId],
  );

  const writeInspection = selected?.writePolicy
    ? inspectPolicyForGrant(
        selected.writePolicy,
        expectedGrantForDraft("write", selected, realmVendorId),
      )
    : null;
  const readInspection = selected?.readPolicy
    ? inspectPolicyForGrant(
        selected.readPolicy,
        expectedGrantForDraft("read", selected, realmVendorId),
      )
    : null;
  const writeReady = grantReady(writeInspection, realmVendorId);
  const readReady = grantReady(readInspection, realmVendorId);
  const readyToSubmit = Boolean(selected) && writeReady && readReady && !selected.submitted;

  async function createDraft(event) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    setNotice("");
    try {
      const data = await api("/api/drafts", { method: "POST", body: { vendorId } });
      const draft = data?.draft;
      if (!draft?.context?.assignmentId) throw new Error("The API did not return a valid draft.");
      pendingDraftRef.current = draft.context.assignmentId;
      setSelectedId(draft.context.assignmentId);
      setNotice(
        "Draft persisted. Administrator signing is still required for both grants before any plaintext is encrypted.",
      );
      drafts.reload();
    } catch (error) {
      setCreateError(error);
    } finally {
      setCreating(false);
    }
  }

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function fillSynthetic() {
    setForm({ ...SYNTHETIC_EXAMPLE });
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!selected) return;
    setFailure(null);
    setSubmitted(null);
    setNotice("");
    if (isInitializing) {
      setFailure({
        kind: "validation",
        error: new Error("The TideCloak provider is still initializing; encryption would return null."),
      });
      return;
    }

    try {
      setPhase("checking");
      const freshResponse = await api(
        `/api/drafts/${encodeURIComponent(selected.context.assignmentId)}`,
      );
      const fresh = freshResponse?.draft;
      if (!fresh) throw new Error("The API did not return the draft.");
      if (fresh.submitted) throw new Error("This draft already has a committed report.");
      if (fresh.context?.domain !== DOMAIN) {
        throw new Error("The draft domain does not match the Embargo report contract.");
      }

      const expectedWrite = expectedGrantForDraft("write", fresh, realmVendorId);
      const expectedRead = expectedGrantForDraft("read", fresh, realmVendorId);
      if (!realmVendorId) {
        throw new Error(
          "The adapter did not expose a realm vendorId, so the signed grants cannot be checked against keyId.",
        );
      }
      assertPolicyForGrant(fresh.writePolicy, expectedWrite);
      assertPolicyForGrant(fresh.readPolicy, expectedRead);

      const plaintext = buildPlaintextReport(fresh.context, {
        title: form.title,
        severity: form.severity,
        details: form.details,
        poc: form.poc,
      });

      setPhase("encrypting");
      const encrypted = await doEncrypt(
        [{ data: plaintext, tags: [fresh.context.assignmentId] }],
        base64ToBytes(fresh.writePolicy),
      );
      const ciphertext = encryptResultToCiphertext(encrypted);
      if (ciphertext.length > 512 * 1024) {
        throw new Error("Ciphertext exceeds the API's 512 KiB base64 limit.");
      }

      setPhase("submitting");
      const stored = await api("/api/reports", {
        method: "POST",
        body: {
          assignmentId: fresh.context.assignmentId,
          ciphertext,
        },
      });
      setForm(EMPTY_FORM);
      setSubmitted(stored?.report ?? null);
      setPhase(null);
      drafts.reload();
    } catch (error) {
      setPhase(null);
      if (error instanceof ApiError) setFailure({ kind: "api", error });
      else if (error instanceof PolicyValidationError) setFailure({ kind: "policy", error });
      else if (TideError.isTideError(error)) setFailure({ kind: "tide", error });
      else setFailure({ kind: "validation", error });
    }
  }

  const phaseLabel = {
    checking: "Re-reading the draft and validating both signed grants…",
    encrypting: "Encrypting the report in this browser with the signed write grant…",
    submitting: "Storing ciphertext and the local activity record…",
  }[phase];

  return (
    <div className="view">
      <SectionHeading
        eyebrow="RESEARCHER WORKSPACE"
        title="Draft, encrypt, submit"
        description="Each revision gets one immutable assignment tag. The API creates the draft and routing context; an administrator signs the exact write and read grants; your browser encrypts the report."
        actions={
          <button
            className="btn btn-secondary"
            type="button"
            onClick={drafts.reload}
            disabled={drafts.status === "loading"}
          >
            {drafts.status === "loading" ? "Refreshing…" : "Refresh drafts"}
          </button>
        }
      />

      {notice ? (
        <Notice tone="info" title="Draft workflow" onDismiss={() => setNotice("")}>
          {notice}
        </Notice>
      ) : null}
      {createError ? (
        <ErrorPanel
          error={createError}
          title="Could not create the draft"
          onRetry={() => setCreateError(null)}
          retryLabel="Dismiss"
        />
      ) : null}
      {failure?.kind === "api" ? (
        <ErrorPanel error={failure.error} title="The submission request failed" />
      ) : null}
      {failure?.kind === "tide" ? <TideFailurePanel error={failure.error} /> : null}
      {failure?.kind === "policy" ? (
        <div className="panel panel-error" role="alert">
          <span className="eyebrow">GRANT MISMATCH</span>
          <h2>Encryption blocked</h2>
          <p>
            The stored signed grants do not match this draft. The browser refuses to encrypt under an
            unverified policy.
          </p>
          <PolicyIssues issues={failure.error.issues} />
        </div>
      ) : null}
      {failure?.kind === "validation" ? (
        <ErrorPanel error={failure.error} title="Submission blocked" />
      ) : null}

      <div className="workspace">
        <aside className="workspace-list">
          <section className="panel flush">
            <div className="panel-heading compact">
              <div>
                <span className="eyebrow">DRAFTS</span>
                <h2>Your revisions</h2>
              </div>
              <span className="pill pill-neutral">{draftList.length}</span>
            </div>
            <form className="stack-form" onSubmit={createDraft}>
              <Field label="Vendor" htmlFor="new-vendor">
                <select
                  id="new-vendor"
                  value={vendorId}
                  onChange={(event) => setVendorId(event.target.value)}
                  disabled={creating}
                >
                  {VENDORS.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button className="btn btn-primary full-width" type="submit" disabled={creating}>
                {creating ? "Creating draft…" : "Create draft"}
              </button>
            </form>
            <div className="list-divider" />
            {drafts.status === "loading" && !drafts.data ? (
              <LoadingBlock label="Loading drafts…" />
            ) : drafts.status === "error" ? (
              <ErrorPanel error={drafts.error} title="Could not load drafts" onRetry={drafts.reload} />
            ) : draftList.length === 0 ? (
              <p className="empty-inline">
                No drafts yet. Choose a vendor and create one. Nothing is encrypted until both grants
                are signed.
              </p>
            ) : (
              <div className="list-stack">
                {draftList.map((draft) => (
                  <DraftListItem
                    key={draft.context.assignmentId}
                    draft={draft}
                    selected={draft.context.assignmentId === selectedId}
                    onSelect={() => setSelectedId(draft.context.assignmentId)}
                  />
                ))}
              </div>
            )}
          </section>
        </aside>

        <div className="workspace-main">
          {!selected ? (
            <section className="panel">
              <h2>No draft selected</h2>
              <p className="muted">
                Create a draft to establish the assignment tag and wait for the two record grants to be
                signed by an administrator.
              </p>
            </section>
          ) : (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">DRAFT RECORD</span>
                    <h2>{vendorName(selected.context.vendorId)}</h2>
                    <p>
                      Revision {selected.context.revision} · created{" "}
                      {formatTimestamp(selected.createdAt)} · state version {selected.stateVersion}
                    </p>
                  </div>
                  <div className="heading-pills">
                    <span className={`pill pill-${selected.submitted ? "positive" : "neutral"}`}>
                      {selected.submitted ? "Report committed" : "Not submitted"}
                    </span>
                  </div>
                </div>
                <ContextMeta context={selected.context} />
                <div className="grant-grid">
                  <GrantReadiness
                    kind="write"
                    draft={selected}
                    realmVendorId={realmVendorId}
                    navigate={navigate}
                  />
                  <GrantReadiness
                    kind="read"
                    draft={selected}
                    realmVendorId={realmVendorId}
                    navigate={navigate}
                  />
                </div>
                {!readyToSubmit && !selected.submitted ? (
                  <Notice
                    tone="warning"
                    title="Administrator signing needed"
                    live={false}
                  >
                    This draft is persisted, but{" "}
                    {[
                      !writeReady ? "the write grant" : null,
                      !readReady ? "the read grant" : null,
                    ]
                      .filter(Boolean)
                      .join(" and ")}{" "}
                    {!writeReady && !readReady ? "are" : "is"} not a matching signed policy for this
                    exact assignment. The app will not fall back to self-encryption or an API-only
                    filter. A realm administrator must initialize and sign the grant in Policy signing.
                  </Notice>
                ) : null}
                {!realmVendorId ? (
                  <Notice tone="danger" title="Adapter vendor id missing" live={false}>
                    The public adapter did not expose a realm vendorId. The browser refuses to treat a
                    policy as matching without checking keyId.
                  </Notice>
                ) : null}
                {readyToSubmit ? (
                  <Notice tone="positive" title="Both grants are present" live={false}>
                    The stored policies structurally match the intended subject, record, operation and
                    key. This local check is not network acceptance; the real encrypt call is the next
                    evidence.
                  </Notice>
                ) : null}
                {selected.submitted ? (
                  <Notice tone="positive" title="Ciphertext committed">
                    The immutable report is stored. Follow its status in{" "}
                    <button className="link-button" type="button" onClick={() => navigate("/reports")}>
                      My reports
                    </button>
                    .
                  </Notice>
                ) : null}
              </section>

              {readyToSubmit ? (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">BROWSER ENCRYPTION</span>
                      <h2>Write the synthetic report</h2>
                      <p>
                        Every field below, including title and severity, is placed inside the
                        encrypted payload. The API receives only the assignment id and ciphertext.
                      </p>
                    </div>
                    <button className="btn btn-ghost" type="button" onClick={fillSynthetic}>
                      Insert synthetic example
                    </button>
                  </div>

                  <form className="report-form" onSubmit={submitReport}>
                    <Field
                      label="Title"
                      htmlFor="report-title"
                      count={characterCount(form.title, 160)}
                      hint="1–160 characters. Never displayed by storage or vendor listings."
                    >
                      <input
                        id="report-title"
                        type="text"
                        value={form.title}
                        onChange={(event) => updateField("title", event.target.value)}
                        maxLength={160}
                        required
                        autoComplete="off"
                        spellCheck="true"
                      />
                    </Field>

                    <Field label="Severity" htmlFor="report-severity" hint="Encrypted with the report.">
                      <select
                        id="report-severity"
                        value={form.severity}
                        onChange={(event) => updateField("severity", event.target.value)}
                      >
                        {SEVERITIES.map((severity) => (
                          <option key={severity} value={severity}>
                            {severity}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label="Details"
                      htmlFor="report-details"
                      className="span-all"
                      count={characterCount(form.details, 65536)}
                      hint="1–65,536 characters. Plaintext stays in this tab and is cleared after success."
                    >
                      <textarea
                        id="report-details"
                        value={form.details}
                        onChange={(event) => updateField("details", event.target.value)}
                        maxLength={65536}
                        rows={8}
                        required
                      />
                    </Field>

                    <Field
                      label="Proof of concept"
                      htmlFor="report-poc"
                      className="span-all"
                      count={characterCount(form.poc, 65536)}
                      hint="Optional, up to 65,536 characters. Rendered as escaped text by the vendor view; never executed."
                    >
                      <textarea
                        id="report-poc"
                        value={form.poc}
                        onChange={(event) => updateField("poc", event.target.value)}
                        maxLength={65536}
                        rows={6}
                      />
                    </Field>

                    <div className="form-footer span-all">
                      <p className="field-hint">
                        The ciphertext is immutable once committed. A new revision needs a new draft and
                        new signed grants.
                      </p>
                      <button className="btn btn-primary" type="submit" disabled={Boolean(phase)}>
                        {phase ? "Working…" : "Encrypt in browser and submit"}
                      </button>
                    </div>
                    {phase ? (
                      <p className="phase-line span-all" role="status" aria-live="polite">
                        {phaseLabel}
                      </p>
                    ) : null}
                  </form>
                </section>
              ) : null}

              {submitted ? (
                <section className="panel">
                  <span className="eyebrow">COMMITTED REPORT</span>
                  <h2>Submission accepted</h2>
                  <MetaGrid
                    items={[
                      { label: "Assignment", value: submitted.context?.assignmentId, mono: true, spanAll: true },
                      { label: "Vendor", value: vendorName(submitted.context?.vendorId) },
                      { label: "Revision", value: submitted.context?.revision, mono: true },
                      { label: "Status", value: submitted.status },
                      { label: "Created", value: formatTimestamp(submitted.createdAt) },
                    ]}
                  />
                  <p className="field-hint">
                    This response is storage metadata only. It does not prove that the network accepted
                    any policy or that a vendor can decrypt.
                  </p>
                  <button className="btn btn-secondary" type="button" onClick={() => navigate("/reports")}>
                    View submission status
                  </button>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>

      <p className="view-footnote">
        Status values exercised: {STATUSES.join(" → ")}. Rendered plaintext is never written to
        localStorage, sessionStorage, the URL, logs or telemetry.
      </p>
    </div>
  );
}
