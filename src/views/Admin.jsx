import { useEffect, useMemo, useState } from "react";
import { useTideCloak } from "@tidecloak/react";
import { TideError } from "@tideorg/js";
import {
  ErrorPanel,
  LoadingBlock,
  MetaGrid,
  Notice,
  PolicyIssues,
  PolicySummary,
  SectionHeading,
  TideFailurePanel,
} from "../components/ui.jsx";
import { ContextMeta } from "../components/reports.jsx";
import { ApiError } from "../lib/api.js";
import { useAsyncData } from "../lib/hooks.js";
import {
  PolicyValidationError,
  approvePersistedRequest,
  buildGrantPolicy,
  decodeSigningRequest,
  describeAdminPolicy,
  expectedGrantForDraft,
  finalizePersistedRequest,
  initializeSigningRequest,
  inspectPolicyForGrant,
  requestApprovalData,
} from "../lib/tide.js";
import { consoleLinkFromConfig, formatTimestamp, shortId, vendorName } from "../lib/util.js";

function failureKind(error) {
  if (error instanceof ApiError) return "api";
  if (error instanceof PolicyValidationError) return "policy";
  if (TideError.isTideError(error)) return "tide";
  return "validation";
}

function GrantCard({ kind, draft, expected, realmVendorId, api, sdk, onChanged, onRefresh }) {
  const signedPolicy = kind === "write" ? draft.writePolicy : draft.readPolicy;
  const requestBase64 = kind === "write" ? draft.writeRequest : draft.readRequest;
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);
  const [enclave, setEnclave] = useState(null);
  const [unpersisted, setUnpersisted] = useState(null);

  useEffect(() => {
    setFailure(null);
    setEnclave(null);
    setUnpersisted(null);
  }, [draft.context?.assignmentId]);

  const signedInspection = useMemo(
    () =>
      signedPolicy
        ? inspectPolicyForGrant(signedPolicy, expected, { requireSignature: true })
        : null,
    [signedPolicy, expected],
  );

  const requestState = useMemo(() => {
    if (!requestBase64) return null;
    try {
      const decoded = decodeSigningRequest(requestBase64);
      return {
        decoded,
        requestId: decoded.getUniqueId(),
        approvalData: requestApprovalData(decoded),
        inspection: inspectPolicyForGrant(decoded.getRequestedPolicy(), expected, {
          requireSignature: false,
        }),
      };
    } catch (error) {
      return { error };
    }
  }, [requestBase64, expected]);

  const signedReady = Boolean(signedInspection && signedInspection.issues.length === 0);
  const requestReady = Boolean(requestState?.inspection && requestState.inspection.issues.length === 0);
  const label = kind === "write" ? "Researcher write grant" : "Vendor read grant";
  const blockedReason =
    !realmVendorId
      ? "The public adapter does not expose a realm vendorId; keyId cannot be checked."
      : !expected
        ? "The draft context is incomplete for this grant."
        : expected.subjectType === "User" && !expected.subjectId
          ? "The draft has no writer tideuserkey."
          : !expected.subjectId
            ? "The draft vendor has no matching realm role."
            : "";

  async function initialize() {
    setBusy("initialize");
    setFailure(null);
    setEnclave(null);
    setUnpersisted(null);
    try {
      if (blockedReason) throw new Error(blockedReason);
      const { policy } = buildGrantPolicy(kind, {
        realmVendorId,
        context: draft.context,
      });
      const initialized = await initializeSigningRequest(sdk, policy);
      const inspection = inspectPolicyForGrant(initialized.requestedPolicy, expected, {
        requireSignature: false,
      });
      if (inspection.issues.length > 0) throw new PolicyValidationError(inspection.issues);

      const data = await api(
        `/api/drafts/${encodeURIComponent(draft.context.assignmentId)}/requests`,
        {
          method: "PUT",
          body: {
            kind,
            request: initialized.requestBase64,
            expectedVersion: draft.stateVersion,
          },
        },
      );
      if (!data?.draft) throw new Error("The API did not return the updated draft.");
      setEnclave({
        tone: "info",
        title: "Request initialized",
        message: `Request ${shortId(initialized.requestId, 12, 8)} was encoded and persisted. It is not a signature.`,
      });
      onChanged(data.draft);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    setBusy("approve");
    setFailure(null);
    setEnclave(null);
    setUnpersisted(null);
    try {
      if (blockedReason) throw new Error(blockedReason);
      if (!requestBase64) throw new Error("There is no persisted signing request to approve.");
      if (requestState?.error) throw requestState.error;
      if (!requestReady) {
        throw new PolicyValidationError(
          requestState?.inspection?.issues ?? ["The persisted request is not readable."],
        );
      }

      let result;
      try {
        result = await approvePersistedRequest({ sdk, requestBase64, expected });
      } catch (error) {
        setFailure(error);
        return;
      }

      if (result.status === "already-approved") {
        setEnclave({
          tone: "info",
          title: "Approval data already present",
          message:
            "The persisted request already carries enclave approval data. Finalize it instead; approving again would add a duplicate approval.",
        });
        return;
      }
      if (result.status === "denied") {
        setEnclave({
          tone: "warning",
          title: "Enclave denied",
          message:
            "The Tide enclave denied the request. No approval bytes were returned, so the previously persisted request is unchanged.",
        });
        return;
      }
      if (result.status === "pending") {
        setEnclave({
          tone: "warning",
          title: "Enclave returned pending",
          message:
            "No approval bytes were returned, so the previously persisted request is unchanged. This interface does not count approvals or infer that quorum was reached.",
        });
        return;
      }

      try {
        const data = await api(
          `/api/drafts/${encodeURIComponent(draft.context.assignmentId)}/requests`,
          {
            method: "PUT",
            body: {
              kind,
              request: result.requestBase64,
              expectedVersion: draft.stateVersion,
            },
          },
        );
        if (!data?.draft) throw new Error("The API did not return the updated draft.");
        setEnclave({
          tone: "positive",
          title: "Approval persisted",
          message: `The enclave returned approval bytes for request ${shortId(result.requestId, 12, 8)}, and the API stored those exact bytes on the draft. Nothing was executed. Finalize when you are ready; the realm threshold still decides whether a signature is returned.`,
        });
        onChanged(data.draft);
      } catch (error) {
        setFailure(error);
        setEnclave({
          tone: "danger",
          title: "Approval not persisted",
          message:
            "The enclave returned approval bytes, but the API did not store them. Nothing was executed. The previously persisted request is unchanged; reload the draft before trying again.",
        });
        onRefresh?.();
      }
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  }

  async function finalize() {
    setBusy("finalize");
    setFailure(null);
    setEnclave(null);
    setUnpersisted(null);
    try {
      if (blockedReason) throw new Error(blockedReason);
      if (!requestBase64) throw new Error("There is no persisted signing request to finalize.");
      if (requestState?.error) throw requestState.error;
      if (!requestReady) {
        throw new PolicyValidationError(
          requestState?.inspection?.issues ?? ["The persisted request is not readable."],
        );
      }
      if (!requestState?.approvalData) {
        throw new Error(
          "The persisted request carries no enclave approval data. Approve it first; execution was not attempted.",
        );
      }

      const currentResponse = await api(
        `/api/drafts/${encodeURIComponent(draft.context.assignmentId)}`,
      );
      const currentDraft = currentResponse?.draft;
      const currentRequest =
        kind === "write" ? currentDraft?.writeRequest : currentDraft?.readRequest;
      if (!currentDraft || currentRequest !== requestBase64) {
        setEnclave({
          tone: "warning",
          title: "Persisted request changed",
          message:
            "The draft's persisted request bytes no longer match this view. Nothing was executed. Reload the draft and finalize the request it actually stores.",
        });
        onRefresh?.();
        return;
      }
      const currentVersion = currentDraft.stateVersion;

      const adminResponse = await api("/api/admin/policy");
      if (!adminResponse?.policy) {
        throw new Error("GET /api/admin/policy did not return the reserved admin policy bytes.");
      }

      let result;
      try {
        result = await finalizePersistedRequest({
          sdk,
          requestBase64,
          adminPolicyBase64: adminResponse.policy,
          expected,
        });
      } catch (error) {
        setFailure(error);
        setEnclave({
          tone: "danger",
          title: "No signature produced",
          message:
            "Execution did not return a signature. The successfully persisted approval bytes remain on the draft, so retrying finalization or letting another independent administrator continue does not require another approval.",
        });
        return;
      }

      try {
        const data = await api(
          `/api/drafts/${encodeURIComponent(draft.context.assignmentId)}/policies`,
          {
            method: "PUT",
            body: {
              kind,
              policy: result.policy,
              expectedVersion: currentVersion,
            },
          },
        );
        if (!data?.draft) throw new Error("The API did not return the updated draft.");
        setEnclave({
          tone: "positive",
          title: "Signed grant stored",
          message: `The SDK returned a ${result.summary.signatureBytes}-byte signature for request ${shortId(result.requestId, 12, 8)}. The API stored the signed bytes on the draft. The realm enforces its own approval threshold; this UI did not count votes.`,
        });
        onChanged(data.draft);
      } catch (error) {
        setFailure(error);
        setUnpersisted(result.policy);
        setEnclave({
          tone: "danger",
          title: "Signature not stored",
          message:
            "The SDK produced a signature, but the API did not store it. The persisted approval bytes remain on the draft and the draft shows no new signed grant. Retrying finalization does not add another approval. Do not treat this as a successful grant.",
        });
      }
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  }

  async function discardRequest() {
    setBusy("discard");
    setFailure(null);
    setEnclave(null);
    setUnpersisted(null);
    try {
      const data = await api(
        `/api/drafts/${encodeURIComponent(draft.context.assignmentId)}/requests`,
        {
          method: "PUT",
          body: { kind, request: null, expectedVersion: draft.stateVersion },
        },
      );
      if (!data?.draft) throw new Error("The API did not return the updated draft.");
      setEnclave({
        tone: "info",
        title: "Pending request discarded",
        message: "The persisted signing-request bytes were cleared. Any stored signed grant is unchanged.",
      });
      onChanged(data.draft);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  }

  const statusPill = signedReady
    ? requestState
      ? { tone: "attention", text: "Signed + replacement request" }
      : { tone: "positive", text: "Signed grant stored" }
    : signedPolicy
      ? { tone: "danger", text: "Stored policy mismatch" }
      : requestState?.approvalData
        ? { tone: "attention", text: "Approval persisted, unsigned" }
        : requestState
          ? { tone: "attention", text: "Request persisted, unsigned" }
          : { tone: "neutral", text: "Not signed" };

  return (
    <article className="panel grant-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{kind.toUpperCase()} POLICY</span>
          <h2>{label}</h2>
        </div>
        <span className={`pill pill-${statusPill.tone}`}>{statusPill.text}</span>
      </div>

      <MetaGrid
        items={[
          { label: "Subject type", value: expected?.subjectType || "unavailable" },
          { label: "Subject id", value: expected?.subjectId || "unavailable", mono: true, spanAll: true },
          { label: "Record", value: draft.context?.assignmentId, mono: true, spanAll: true },
          { label: "Operation roles", value: expected?.roles?.join(", ") || "unavailable", mono: true },
          { label: "Realm vendor key", value: realmVendorId || "missing from adapter", mono: true },
        ]}
      />

      {blockedReason ? (
        <Notice tone="danger" title="Grant cannot be prepared" live={false}>
          {blockedReason}
        </Notice>
      ) : null}

      {signedPolicy ? (
        <section className="nested-panel">
          <h3>Stored signed grant</h3>
          {signedInspection?.issues.length ? (
            <PolicyIssues issues={signedInspection.issues} />
          ) : (
            <>
              <PolicySummary summary={signedInspection?.summary} />
              <details className="inline-details">
                <summary>Signed policy bytes (base64)</summary>
                <pre className="ciphertext-block">{signedPolicy}</pre>
              </details>
              <p className="field-hint">
                Structural check only. A present signature does not prove the network will accept the
                policy until a real encrypt or decrypt succeeds.
              </p>
            </>
          )}
        </section>
      ) : null}

      {requestState ? (
        <section className="nested-panel">
          <h3>Persisted signing request</h3>
          {requestState.error ? (
            <ErrorPanel error={requestState.error} title="Stored request cannot be decoded" />
          ) : (
            <>
              <dl className="inline-meta">
                <div>
                  <dt>Request id</dt>
                  <dd className="mono">{shortId(requestState.requestId, 12, 8)}</dd>
                </div>
                <div>
                  <dt>Encoded size</dt>
                  <dd>{requestBase64.length} base64 characters</dd>
                </div>
                <div>
                  <dt>Enclave approval data</dt>
                  <dd>{requestState.approvalData ? "present in persisted bytes" : "none"}</dd>
                </div>
              </dl>
              <PolicySummary summary={requestState.inspection?.summary} />
              <PolicyIssues issues={requestState.inspection?.issues} />
              {requestState.approvalData ? (
                <>
                  <p className="field-hint">
                    Decoded from the exact bytes persisted by the API. This request already carries
                    enclave approval data, so finalization executes those bytes. The browser does not
                    count approvals or infer that the realm threshold was reached; only the network
                    response decides whether a signature is returned.
                  </p>
                  <div className="action-row">
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={finalize}
                      disabled={Boolean(busy) || !requestReady || Boolean(blockedReason)}
                    >
                      {busy === "finalize"
                        ? "Waiting for Tide network…"
                        : "Finalize persisted approval & sign"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={discardRequest}
                      disabled={Boolean(busy)}
                    >
                      Discard pending request
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="field-hint">
                    Decoded from the exact bytes persisted by the API. The policy above is what the
                    next approval would sign; there is no arbitrary backend-supplied label. Approval
                    bytes are persisted before any execution, and execution is a separate finalize
                    step.
                  </p>
                  <div className="action-row">
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={approve}
                      disabled={Boolean(busy) || !requestReady || Boolean(blockedReason)}
                    >
                      {busy === "approve" ? "Waiting for Tide enclave…" : "Approve in Tide enclave"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={discardRequest}
                      disabled={Boolean(busy)}
                    >
                      Discard pending request
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      ) : null}

      {!requestState && !signedPolicy ? (
        <div className="action-row">
          <button
            className="btn btn-primary"
            type="button"
            onClick={initialize}
            disabled={Boolean(busy) || Boolean(blockedReason)}
          >
            {busy === "initialize" ? "Initializing request…" : "Initialize signing request"}
          </button>
          <span className="field-hint">
            Initialization produces encoded request bytes only. It does not sign or grant access.
          </span>
        </div>
      ) : null}

      {!requestState && signedPolicy && !draft.submitted ? (
        <div className="action-row">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={initialize}
            disabled={Boolean(busy) || Boolean(blockedReason)}
          >
            {busy === "initialize" ? "Initializing request…" : "Initialize replacement request"}
          </button>
          <span className="field-hint">
            A replacement takes effect only after the enclave approves and the network returns a
            signature that the API stores. Existing encryption must not use a mismatched grant.
          </span>
        </div>
      ) : null}

      {signedPolicy && draft.submitted ? (
        <p className="field-hint">
          This report is already submitted; the API rejects replacing its signed grants.
        </p>
      ) : null}

      {enclave ? (
        <Notice
          tone={enclave.tone}
          title={enclave.title}
          onDismiss={() => setEnclave(null)}
        >
          {enclave.message}
        </Notice>
      ) : null}

      {unpersisted ? (
        <section className="nested-panel">
          <h3>Unpersisted signature (direct-test only)</h3>
          <Notice tone="danger" title="Not a stored grant" live={false}>
            The API refused to store these signed bytes, so the draft has no new signed grant. They are
            shown only so an authorised administrator can test whether the Tide network accepts the
            policy in Direct probe. Do not use them for encryption or vendor access in this app.
          </Notice>
          <details className="inline-details">
            <summary>Signed bytes rejected by the API</summary>
            <pre className="ciphertext-block">{unpersisted}</pre>
          </details>
          <button className="btn btn-ghost" type="button" onClick={() => setUnpersisted(null)}>
            Clear unpersisted bytes
          </button>
        </section>
      ) : null}

      {failure ? (
        failureKind(failure) === "api" ? (
          <ErrorPanel error={failure} title="API rejected the signing update" />
        ) : failureKind(failure) === "policy" ? (
          <div className="panel panel-error" role="alert">
            <span className="eyebrow">POLICY CHECK FAILED</span>
            <h3>Signing refused</h3>
            <PolicyIssues issues={failure.issues} />
          </div>
        ) : failureKind(failure) === "tide" ? (
          <TideFailurePanel error={failure} />
        ) : (
          <ErrorPanel error={failure} title="Signing operation failed" />
        )
      ) : null}
    </article>
  );
}

export default function Admin({ identity, api, setup }) {
  const {
    initializeTideRequest,
    approveTideRequests,
    executeTideRequest,
    getVendorId,
  } = useTideCloak();
  const drafts = useAsyncData(() => api("/api/drafts"), `admin-drafts:${identity.key}`);
  const adminPolicy = useAsyncData(() => api("/api/admin/policy"), `admin-policy:${identity.key}`);
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState("");
  const [overrides, setOverrides] = useState({});
  const realmVendorId = getVendorId();
  const consoleUrl = consoleLinkFromConfig(setup?.config);
  const sdk = { initializeTideRequest, approveTideRequests, executeTideRequest };

  const serverList = Array.isArray(drafts.data?.drafts) ? drafts.data.drafts : [];
  const list = serverList.map((draft) => {
    const id = draft.context?.assignmentId;
    const local = id ? overrides[id] : null;
    if (!local) return draft;
    return (local.stateVersion ?? 0) > (draft.stateVersion ?? 0) ? local : draft;
  });

  useEffect(() => {
    if (list.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!list.some((draft) => draft.context?.assignmentId === selectedId)) {
      setSelectedId(list[0].context.assignmentId);
    }
  }, [list, selectedId]);

  const selected = useMemo(
    () => list.find((draft) => draft.context?.assignmentId === selectedId) ?? null,
    [list, selectedId],
  );

  const adminPolicyParse = useMemo(() => {
    const value = adminPolicy.data?.policy;
    if (!value) return null;
    try {
      return { summary: describeAdminPolicy(value) };
    } catch (error) {
      return { error };
    }
  }, [adminPolicy.data?.policy]);

  const expectedWrite = selected
    ? expectedGrantForDraft("write", selected, realmVendorId)
    : null;
  const expectedRead = selected
    ? expectedGrantForDraft("read", selected, realmVendorId)
    : null;

  function handleChanged(updatedDraft) {
    const id = updatedDraft?.context?.assignmentId;
    if (id) {
      setOverrides((current) => ({ ...current, [id]: updatedDraft }));
    }
    setNotice("Draft state changed. Requests and grants below are refreshed from the API.");
    drafts.reload();
  }

  return (
    <div className="view">
      <SectionHeading
        eyebrow="GOVERNANCE WORKSPACE"
        title="Sign genuine record policies"
        description="An administrator initializes exact relationship policies for one draft, approves the encoded request in the Tide enclave and persists the returned approval bytes, then finalizes separately by executing those exact persisted bytes with the reserved admin policy read using the caller's own credential."
        actions={
          <>
            {consoleUrl ? (
              <a className="btn btn-ghost" href={consoleUrl} target="_blank" rel="noreferrer noopener">
                Open TideCloak console
              </a>
            ) : null}
            <button
              className="btn btn-secondary"
              type="button"
              onClick={drafts.reload}
              disabled={drafts.status === "loading"}
            >
              {drafts.status === "loading" ? "Refreshing…" : "Refresh drafts"}
            </button>
          </>
        }
      />

      {notice ? (
        <Notice tone="info" title="Draft refreshed" onDismiss={() => setNotice("")}>
          {notice}
        </Notice>
      ) : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">RESERVED ADMIN POLICY</span>
            <h2>Read with your bearer token</h2>
            <p>
              Fetched from <code>GET /api/admin/policy</code>. The API must read the named{" "}
              <code>tide-realm-admin</code> policy; the browser never receives a service credential.
            </p>
          </div>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={adminPolicy.reload}
            disabled={adminPolicy.status === "loading"}
          >
            {adminPolicy.status === "loading" ? "Loading…" : "Reload"}
          </button>
        </div>
        {adminPolicy.status === "error" ? (
          <ErrorPanel
            error={adminPolicy.error}
            title="Reserved admin policy unavailable"
            onRetry={adminPolicy.reload}
          />
        ) : adminPolicy.status === "loading" && !adminPolicy.data ? (
          <LoadingBlock label="Reading reserved admin policy…" />
        ) : adminPolicyParse?.error ? (
          <Notice tone="warning" title="Admin policy is not readable for display" live={false}>
            The returned bytes were not parseable as a Tide policy object. Signing will still attach the
            exact returned bytes unchanged; the network decides whether they authorise the request.
          </Notice>
        ) : adminPolicyParse?.summary ? (
          <>
            <MetaGrid
              items={[
                { label: "Contract", value: adminPolicyParse.summary.contractId, mono: true },
                { label: "Policy version", value: adminPolicyParse.summary.version, mono: true },
                { label: "Key id", value: adminPolicyParse.summary.keyId, mono: true, spanAll: true },
                {
                  label: "Signature",
                  value: `${adminPolicyParse.summary.signatureBytes} bytes`,
                },
              ]}
            />
            {adminPolicyParse.summary.signed ? null : (
              <Notice tone="warning" title="No signature detected in the reserved policy" live={false}>
                The app does not treat that as success or failure; it attaches the bytes unchanged and
                shows the network's actual response.
              </Notice>
            )}
            <p className="field-hint">
              The app shows local policy metadata for inspection only. It does not verify the admin
              policy's cryptographic validity itself.
            </p>
          </>
        ) : (
          <p className="muted">No reserved admin policy bytes were returned.</p>
        )}
      </section>

      {realmVendorId ? null : (
        <Notice tone="danger" title="Realm vendor id unavailable" live={false}>
          The public adapter does not expose a realm vendorId. Policy keyId cannot be built or checked,
          so signing is blocked in this interface.
        </Notice>
      )}

      {drafts.status === "error" ? (
        <ErrorPanel error={drafts.error} title="Could not load drafts" onRetry={drafts.reload} />
      ) : drafts.status === "loading" && !drafts.data ? (
        <LoadingBlock label="Loading all drafts and signing requests…" />
      ) : list.length === 0 ? (
        <section className="panel">
          <div className="empty-state">
            <h3>No drafts to sign</h3>
            <p>
              A researcher must create a draft first. The draft establishes the assignment tag,
              writer key and vendor recipient that a policy binds.
            </p>
          </div>
        </section>
      ) : (
        <div className="workspace">
          <aside className="workspace-list">
            <section className="panel flush">
              <div className="panel-heading compact">
                <div>
                  <span className="eyebrow">ALL DRAFTS</span>
                  <h2>Record queue</h2>
                </div>
                <span className="pill pill-neutral">{list.length}</span>
              </div>
              <div className="list-stack">
                {list.map((draft) => {
                  const active = draft.context.assignmentId === selectedId;
                  const writeSigned = Boolean(draft.writePolicy);
                  const readSigned = Boolean(draft.readPolicy);
                  return (
                    <button
                      key={draft.context.assignmentId}
                      className={`list-item ${active ? "selected" : ""}`}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedId(draft.context.assignmentId)}
                    >
                      <span className="list-item-top">
                        <strong>{vendorName(draft.context.vendorId)}</strong>
                        <span className={`pill pill-${draft.submitted ? "positive" : "neutral"}`}>
                          {draft.submitted ? "Submitted" : "Open"}
                        </span>
                      </span>
                      <span className="list-item-sub">
                        rev {draft.context.revision} · {formatTimestamp(draft.createdAt)}
                      </span>
                      <span className="list-item-sub">
                        write {writeSigned ? "signed" : "unsigned"} · read{" "}
                        {readSigned ? "signed" : "unsigned"}
                      </span>
                      <span className="list-item-id mono">
                        {shortId(draft.context.assignmentId, 10, 6)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </aside>

          <div className="workspace-main">
            {!selected ? (
              <section className="panel">
                <h2>No draft selected</h2>
              </section>
            ) : (
              <>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">EXACT RECORD CONTEXT</span>
                      <h2>{vendorName(selected.context.vendorId)}</h2>
                      <p>
                        Revision {selected.context.revision} · state version {selected.stateVersion} ·{" "}
                        {selected.submitted ? "submitted" : "open"}
                      </p>
                    </div>
                    <span className="pill pill-neutral">writer key bound</span>
                  </div>
                  <ContextMeta context={selected.context} />
                  <Notice tone="info" title="Approval and execution are separate steps" live={false}>
                    The browser can show a request and an enclave response. It must not claim quorum
                    from a popup, count votes locally, or generate a signature. Approval bytes are
                    persisted on the draft before execution; finalization executes those exact bytes,
                    and a signed grant is stored only after the network returns a signature for the
                    exact requested policy.
                  </Notice>
                </section>

                <GrantCard
                  kind="write"
                  draft={selected}
                  expected={expectedWrite}
                  realmVendorId={realmVendorId}
                  api={api}
                  sdk={sdk}
                  onChanged={handleChanged}
                  onRefresh={drafts.reload}
                />
                <GrantCard
                  kind="read"
                  draft={selected}
                  expected={expectedRead}
                  realmVendorId={realmVendorId}
                  api={api}
                  sdk={sdk}
                  onChanged={handleChanged}
                  onRefresh={drafts.reload}
                />
              </>
            )}
          </div>
        </div>
      )}

      <p className="view-footnote">
        Independent approvals require separate admin browsers and credentials. One person holding
        multiple accounts does not demonstrate organisational independence.
      </p>
    </div>
  );
}
