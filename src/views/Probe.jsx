import { useMemo, useState } from "react";
import { useTideCloak } from "@tidecloak/react";
import { TideError } from "@tideorg/js";
import { parseDecryptedReport } from "../../shared/contracts.mjs";
import {
  ErrorPanel,
  Field,
  MetaGrid,
  Notice,
  PolicySummary,
  SectionHeading,
  TideFailurePanel,
} from "../components/ui.jsx";
import { useAsyncData } from "../lib/hooks.js";
import {
  base64ToBytes,
  decryptResultToText,
  describePolicyBase64,
} from "../lib/tide.js";
import {
  formatDurationSeconds,
  formatTimestamp,
  shortId,
  vendorName,
} from "../lib/util.js";

export default function Probe({ identity, api }) {
  const {
    doDecrypt,
    isInitializing,
    refreshToken,
    forceRefreshToken,
    tokenExp,
  } = useTideCloak();
  const raw = useAsyncData(
    () =>
      identity.operator
        ? api("/api/operator/raw")
        : Promise.resolve({ reports: [] }),
    `probe-raw:${identity.key}:${identity.operator}`,
  );
  const adminDrafts = useAsyncData(
    () => (identity.admin ? api("/api/drafts") : Promise.resolve({ drafts: [] })),
    `probe-drafts:${identity.key}:${identity.admin}`,
  );

  const [recordId, setRecordId] = useState("");
  const [policyDraftId, setPolicyDraftId] = useState("");
  const [ciphertext, setCiphertext] = useState("");
  const [policyBase64, setPolicyBase64] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [expectedContext, setExpectedContext] = useState(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [attempting, setAttempting] = useState(false);
  const [result, setResult] = useState(null);
  const [inputFailure, setInputFailure] = useState(null);
  const [tokenBusy, setTokenBusy] = useState(null);
  const [tokenOutcome, setTokenOutcome] = useState(null);
  const [tokenFailure, setTokenFailure] = useState(null);

  const reports = Array.isArray(raw.data?.reports) ? raw.data.reports : [];
  const drafts = Array.isArray(adminDrafts.data?.drafts) ? adminDrafts.data.drafts : [];
  const policyState = useMemo(() => {
    const value = policyBase64.trim();
    if (!value) return null;
    try {
      return { summary: describePolicyBase64(value) };
    } catch (error) {
      return { error };
    }
  }, [policyBase64]);

  const tagMismatch =
    Boolean(policyState?.summary?.recordId) &&
    Boolean(assignmentId.trim()) &&
    policyState.summary.recordId !== assignmentId.trim();

  function loadRecord(id) {
    setRecordId(id);
    setResult(null);
    setInputFailure(null);
    const report = reports.find((item) => item.context?.assignmentId === id);
    if (!report) return;
    setCiphertext(report.ciphertext || "");
    if (typeof report.readPolicy === "string" && report.readPolicy.length > 0) {
      setPolicyBase64(report.readPolicy);
    }
    setAssignmentId(report.context?.assignmentId || "");
    setExpectedContext(report.context || null);
    setSourceLabel(
      `${vendorName(report.context?.vendorId)} · revision ${report.context?.revision} · ${formatTimestamp(report.createdAt)}`,
    );
  }

  function loadPolicyFromDraft(id) {
    setPolicyDraftId(id);
    if (!id) return;
    setResult(null);
    setInputFailure(null);
    const draft = drafts.find((item) => item.context?.assignmentId === id);
    if (!draft) return;
    setPolicyBase64(draft.readPolicy || "");
    setAssignmentId(draft.context?.assignmentId || "");
    setExpectedContext(draft.context || null);
    setSourceLabel(
      `${vendorName(draft.context?.vendorId)} · draft revision ${draft.context?.revision} · signed read grant`,
    );
  }

  function clearLoadedContext() {
    setExpectedContext(null);
    setSourceLabel("");
  }

  async function attemptDecrypt() {
    setInputFailure(null);
    setResult(null);
    setAttempting(true);
    try {
      if (isInitializing) {
        throw new Error("The TideCloak provider is still initializing; doDecrypt would return null.");
      }
      if (!ciphertext.trim()) throw new Error("Supply ciphertext before attempting decryption.");
      if (!policyBase64.trim()) throw new Error("Supply signed read-policy bytes.");
      if (!assignmentId.trim()) throw new Error("Supply the sole assignment tag.");
      if (policyState?.error) throw policyState.error;

      const decrypted = await doDecrypt(
        [{ encrypted: ciphertext, tags: [assignmentId.trim()] }],
        base64ToBytes(policyBase64.trim()),
      );
      const text = decryptResultToText(decrypted);

      let localCheck = null;
      if (expectedContext) {
        try {
          parseDecryptedReport(text, expectedContext);
          localCheck = { ok: true };
        } catch (error) {
          localCheck = { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
      }
      setResult({ status: "success", text, localCheck });
    } catch (error) {
      if (TideError.isTideError(error)) {
        setResult({ status: "sdk-error", error });
      } else {
        setInputFailure(error);
      }
    } finally {
      setAttempting(false);
    }
  }

  async function runTokenRefresh(force) {
    setTokenBusy(force ? "force" : "normal");
    setTokenOutcome(null);
    setTokenFailure(null);
    try {
      const refreshed = force ? await forceRefreshToken() : await refreshToken();
      setTokenOutcome({ force, refreshed });
    } catch (error) {
      setTokenFailure({ force, error });
    } finally {
      setTokenBusy(null);
    }
  }

  function resetInputs() {
    setRecordId("");
    setPolicyDraftId("");
    setCiphertext("");
    setPolicyBase64("");
    setAssignmentId("");
    setExpectedContext(null);
    setSourceLabel("");
    setResult(null);
    setInputFailure(null);
    setTokenOutcome(null);
    setTokenFailure(null);
  }

  if (!identity.operator && !identity.admin) {
    return (
      <section className="panel" role="alert">
        <span className="eyebrow">ROLE REQUIRED</span>
        <h2>Operator or administrator role required</h2>
        <p>
          The direct probe uses the real SDK and therefore needs an authorised identity. The API and
          navigation reject other roles.
        </p>
      </section>
    );
  }

  return (
    <div className="view">
      <SectionHeading
        eyebrow="DIRECT TIDE PROBE"
        title="Call the real SDK independently of the inbox"
        description="Supply ciphertext, a signed policy and the sole assignment tag. This surface makes no pass/fail conclusion; it reports the SDK's actual result and any local schema check you explicitly loaded."
        actions={
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              if (identity.operator) raw.reload();
              if (identity.admin) adminDrafts.reload();
            }}
            disabled={
              (identity.operator && raw.status === "loading") ||
              (identity.admin && adminDrafts.status === "loading")
            }
          >
            {raw.status === "loading" || adminDrafts.status === "loading"
              ? "Refreshing…"
              : "Refresh probe sources"}
          </button>
        }
      />

      <Notice tone="info" title="What a result means">
        A plaintext result means the SDK returned plaintext for exactly the supplied ciphertext, tag
        and policy. It does not by itself prove governance accepted the grant. A failure is not
        automatically an access denial: a missing operation role, malformed input, network error or
        threshold refusal are different observations. Classify the cause.
      </Notice>

      <div className="grid grid-3 compact-grid">
        <article className="mini-card">
          <strong>Operation role in this token</strong>
          <p>
            {identity.decryptor ? (
              <span className="pill pill-positive">_tide_decryptor present</span>
            ) : (
              <span className="pill pill-danger">_tide_decryptor absent</span>
            )}
          </p>
          <p className="field-hint">
            Necessary, not sufficient. If absent, a refusal may be the operation gate rather than
            issued-policy governance.
          </p>
        </article>
        <article className="mini-card">
          <strong>Token lifetime</strong>
          <p>{formatDurationSeconds(identity.tokenExp ?? tokenExp)} remaining</p>
          <p className="field-hint">
            <code>refreshToken()</code> updates only if needed. <code>forceRefreshToken()</code> forces
            renewal. Neither revokes old policy authority.
          </p>
        </article>
        <article className="mini-card">
          <strong>Vendor roles</strong>
          <p>
            {identity.vendors.length > 0 ? (
              identity.vendors.map((vendor) => (
                <span className="chip" key={vendor.id}>
                  {vendor.role}
                </span>
              ))
            ) : (
              <span className="muted">No vendor role in this token</span>
            )}
          </p>
          <p className="field-hint">
            A vendor role is not an assignment-specific read grant.
          </p>
        </article>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">TOKEN REFRESH</span>
            <h2>Measure credentials separately</h2>
          </div>
        </div>
        <div className="action-row">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => runTokenRefresh(false)}
            disabled={Boolean(tokenBusy)}
          >
            {tokenBusy === "normal" ? "Refreshing if needed…" : "refreshToken()"}
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => runTokenRefresh(true)}
            disabled={Boolean(tokenBusy)}
          >
            {tokenBusy === "force" ? "Forcing renewal…" : "forceRefreshToken()"}
          </button>
        </div>
        {tokenOutcome ? (
          <p role="status" className="phase-line">
            {tokenOutcome.force ? "forceRefreshToken()" : "refreshToken()"} returned{" "}
            <strong>{String(tokenOutcome.refreshed)}</strong>.{" "}
            {tokenOutcome.force
              ? "This requested a forced renewal; any old-credential authority must still be tested against the network."
              : "This is an update-if-needed call, not a guaranteed forced renewal."}
          </p>
        ) : null}
        {tokenFailure ? (
          <ErrorPanel
            error={tokenFailure.error}
            title={tokenFailure.force ? "Forced token refresh failed" : "Token refresh failed"}
          />
        ) : null}
        <p className="field-hint">
          Revocation is a governed realm role/policy action, not a local button. Saved plaintext and
          keys already used cannot be clawed back by refreshing a token.
        </p>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">PROBE INPUTS</span>
            <h2>Ciphertext, policy bytes, assignment tag</h2>
          </div>
          {identity.operator ? (
            <div className="inline-field">
              <label htmlFor="probe-record">Load stored record</label>
              <select id="probe-record" value={recordId} onChange={(event) => loadRecord(event.target.value)}>
                <option value="">Choose a record…</option>
                {reports.map((report) => (
                  <option key={report.context?.assignmentId} value={report.context?.assignmentId}>
                    {vendorName(report.context?.vendorId)} · rev {report.context?.revision} ·{" "}
                    {shortId(report.context?.assignmentId, 10, 6)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="pill pill-neutral">Paste from an authorised record</span>
          )}
        </div>

        {identity.admin ? (
          <div className="toolbar-row">
            <div className="inline-field">
              <label htmlFor="probe-policy-draft">Load signed read policy from draft</label>
              <select
                id="probe-policy-draft"
                value={policyDraftId}
                onChange={(event) => loadPolicyFromDraft(event.target.value)}
              >
                <option value="">Choose a draft with a read grant…</option>
                {drafts
                  .filter((draft) => typeof draft.readPolicy === "string" && draft.readPolicy.length > 0)
                  .map((draft) => (
                    <option key={draft.context?.assignmentId} value={draft.context?.assignmentId}>
                      {vendorName(draft.context?.vendorId)} · rev {draft.context?.revision} ·{" "}
                      {shortId(draft.context?.assignmentId, 10, 6)}
                    </option>
                  ))}
              </select>
            </div>
            <p className="field-hint">
              Admins can read the exact stored signed bytes. Operators load ciphertext from the raw
              view; paste the matching policy here when using a separate operator identity.
            </p>
          </div>
        ) : null}

        {identity.admin && adminDrafts.status === "error" ? (
          <ErrorPanel
            error={adminDrafts.error}
            title="Could not load drafts for policy selection"
            onRetry={adminDrafts.reload}
          />
        ) : null}

        {identity.operator && raw.status === "error" ? (
          <ErrorPanel error={raw.error} title="Could not read operator records" onRetry={raw.reload} />
        ) : null}

        {sourceLabel ? (
          <div className="source-line">
            <span>
              Loaded context: <strong>{sourceLabel}</strong>
            </span>
            <button className="link-button" type="button" onClick={clearLoadedContext}>
              Drop local context check
            </button>
          </div>
        ) : null}

        <div className="probe-form">
          <Field
            label="Assignment tag (the only SDK tag)"
            htmlFor="probe-tag"
            hint="Exactly one tag is expected: the draft's full assignmentId."
          >
            <input
              id="probe-tag"
              type="text"
              value={assignmentId}
              onChange={(event) => setAssignmentId(event.target.value)}
              autoComplete="off"
              spellCheck="false"
            />
          </Field>

          <Field
            label="Signed read policy (base64)"
            htmlFor="probe-policy"
            className="span-all"
            hint="Raw signed policy bytes as stored by the exchange. The SDK receives these bytes unchanged."
          >
            <textarea
              id="probe-policy"
              value={policyBase64}
              onChange={(event) => setPolicyBase64(event.target.value)}
              rows={4}
              spellCheck="false"
              autoComplete="off"
            />
          </Field>

          <Field
            label="Ciphertext"
            htmlFor="probe-ciphertext"
            className="span-all"
            hint="Stored ciphertext text. This probe does not strip tags or alter the input."
          >
            <textarea
              id="probe-ciphertext"
              value={ciphertext}
              onChange={(event) => setCiphertext(event.target.value)}
              rows={6}
              spellCheck="false"
              autoComplete="off"
            />
          </Field>
        </div>

        {policyState?.error ? (
          <ErrorPanel error={policyState.error} title="Policy is not readable base64/policy bytes" />
        ) : policyState?.summary ? (
          <>
            <PolicySummary summary={policyState.summary} />
            {tagMismatch ? (
              <Notice tone="warning" title="Tag differs from the policy record" live={false}>
                The supplied tag is not the policy's <code>assignmentId</code>. The probe will pass it
                unchanged so the SDK can decide; do not describe the outcome as normal access.
              </Notice>
            ) : null}
          </>
        ) : null}

        <div className="action-row">
          <button
            className="btn btn-primary"
            type="button"
            onClick={attemptDecrypt}
            disabled={attempting || Boolean(policyState?.error)}
          >
            {attempting ? "Calling the SDK…" : "Attempt real SDK decryption"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={resetInputs} disabled={attempting}>
            Reset inputs
          </button>
        </div>

        {inputFailure ? (
          <ErrorPanel error={inputFailure} title="Probe input rejected locally" />
        ) : null}
      </section>

      {result?.status === "sdk-error" ? (
        <>
          <TideFailurePanel error={result.error} />
          {!identity.decryptor ? (
            <Notice tone="warning" title="Operation role absent">
              This token has no <code>_tide_decryptor</code> realm role. The observed refusal may be
              the operation gate, not proof that the recipient policy or policy issuance is governed.
            </Notice>
          ) : null}
        </>
      ) : null}

      {result?.status === "success" ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">OBSERVED RESULT</span>
              <h2>The SDK returned plaintext</h2>
            </div>
            <span className="pill pill-positive">plaintext returned</span>
          </div>
          <p className="field-hint">
            This is the real decryption result for the supplied inputs. It is not a governance verdict.
          </p>
          {result.localCheck ? (
            result.localCheck.ok ? (
              <Notice tone="positive" title="Local context check passed" live={false}>
                <code>parseDecryptedReport</code> accepted the plaintext against the loaded record
                context. This is an application schema/context check, not network authorisation.
              </Notice>
            ) : (
              <Notice tone="danger" title="Local context check failed" live={false}>
                {result.localCheck.message}. The probe still shows the raw SDK output because it is a
                direct test surface; a normal vendor view would refuse to render it.
              </Notice>
            )
          ) : (
            <p className="field-hint">
              No expected context was loaded, so no local schema/context check was run.
            </p>
          )}
          <pre className="plaintext-block probe-output">{result.text}</pre>
          <button className="btn btn-ghost" type="button" onClick={() => setResult(null)}>
            Clear decrypted output
          </button>
        </section>
      ) : null}

      <section className="panel">
        <span className="eyebrow">CONTROLLED MAX TEST</span>
        <h2>One admin versus two admins</h2>
        <p>
          Use one operation-capable identity, Max, with a legitimately approved{" "}
          <code>_tide_decryptor</code> role. Do not grant Max a matching vendor role or read policy as
          part of the test. Keep Max, the assignmentId, ciphertext, tag and intended recipient grant
          identical in both attempts.
        </p>
        <ol className="step-list numbered">
          <li>
            <span>1</span>
            <div>
              <strong>One-admin attempt</strong>
              <p>
                One administrator initializes and approves a replacement read grant naming Max for the
                existing assignment. Inspect the enclave response and whether a signature is returned
                and stored. If the API refuses to store it after submission, that refusal is not proof
                of network enforcement; the unpersisted signed bytes may still be tested here as a
                test artifact, never as a grant.
              </p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Positive control</strong>
              <p>
                Two independently controlled administrators authorise an equivalent grant for Max.
                The positive control must decrypt the same ciphertext with the same tag. If it does
                not, the one-admin result is inconclusive.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Interpret the observation</strong>
              <p>
                Plaintext from the one-admin grant means unilateral access was not stopped. A threshold
                failure may be denial; inspect its cause. A missing operation role, an app-side filter,
                an outage or a failed positive control is not evidence of governed issuance.
              </p>
            </div>
          </li>
        </ol>
        <Notice tone="warning" title="No simulated votes" live={false}>
          This interface never counts approvals, applies an app-side quorum or generates a signature.
          The realm must enforce the real admin threshold. One person holding three accounts does not
          demonstrate independent governance.
        </Notice>
      </section>

      <section className="panel">
        <span className="eyebrow">PASTED INPUTS</span>
        <h2>Isolation and context checks</h2>
        <MetaGrid
          items={[
            {
              label: "Loaded local context",
              value: expectedContext ? sourceLabel || "context present" : "none",
            },
            { label: "Policy record", value: policyState?.summary?.recordId, mono: true, spanAll: true },
            { label: "Supplied tag", value: assignmentId.trim(), mono: true, spanAll: true },
            { label: "Ciphertext length", value: `${ciphertext.length} characters` },
          ]}
        />
        <p className="field-hint">
          To test recipient isolation, give the same ciphertext and policy bytes to an identity without
          the named subject or without <code>_tide_decryptor</code>, and compare the observed causes.
          Do not label a refused HTTP request in this app as network-enforced isolation.
        </p>
      </section>
    </div>
  );
}
