import { useEffect, useMemo, useState } from "react";
import { useTideCloak } from "@tidecloak/react";
import { TideError } from "@tideorg/js";
import { DOMAIN, parseDecryptedReport } from "../../shared/contracts.mjs";
import {
  ErrorPanel,
  Field,
  LoadingBlock,
  MetaGrid,
  Notice,
  PolicyIssues,
  SectionHeading,
  StatusPill,
  TideFailurePanel,
} from "../components/ui.jsx";
import { ContextMeta } from "../components/reports.jsx";
import { ApiError } from "../lib/api.js";
import { useAsyncData } from "../lib/hooks.js";
import {
  PolicyValidationError,
  assertPolicyForGrant,
  base64ToBytes,
  decryptResultToText,
  expectedGrantForDraft,
  inspectPolicyForGrant,
} from "../lib/tide.js";
import {
  formatTimestamp,
  nextReportStatus,
  nextStatusLabel,
  shortId,
  statusLabel,
  vendorName,
} from "../lib/util.js";

export default function VendorInbox({ identity, api }) {
  const { doDecrypt, isInitializing, getVendorId } = useTideCloak();
  const vendors = identity.vendors;
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [decrypted, setDecrypted] = useState(null);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(null);
  const realmVendorId = getVendorId();

  const reports = useAsyncData(
    () =>
      vendorId
        ? api(`/api/reports?vendorId=${encodeURIComponent(vendorId)}`)
        : Promise.resolve({ reports: [] }),
    `vendor-inbox:${identity.key}:${vendorId}`,
  );

  const list = Array.isArray(reports.data?.reports) ? reports.data.reports : [];

  useEffect(() => {
    setSelectedReportId(null);
    setDecrypted(null);
    setFailure(null);
    setNotice("");
  }, [vendorId]);

  useEffect(() => {
    if (list.length === 0) {
      if (selectedReportId !== null) setSelectedReportId(null);
      return;
    }
    if (!list.some((report) => report.context?.assignmentId === selectedReportId)) {
      setSelectedReportId(list[0].context.assignmentId);
    }
  }, [list, selectedReportId]);

  useEffect(() => {
    setDecrypted(null);
    setFailure(null);
  }, [selectedReportId]);

  const selected = useMemo(
    () => list.find((report) => report.context?.assignmentId === selectedReportId) ?? null,
    [list, selectedReportId],
  );

  const selectedContext = selected?.context ?? null;
  const policyInspection = selected?.readPolicy
    ? inspectPolicyForGrant(
        selected.readPolicy,
        expectedGrantForDraft("read", { context: selectedContext }, realmVendorId),
      )
    : null;

  async function decryptReport() {
    if (!selected) return;
    setFailure(null);
    setNotice("");
    setDecrypted(null);

    try {
      if (isInitializing) {
        throw new Error("The TideCloak provider is still initializing; decryption would return null.");
      }
      if (!selectedContext || selectedContext.domain !== DOMAIN) {
        throw new Error("The stored report domain does not match the Embargo contract.");
      }
      if (selectedContext.vendorId !== vendorId) {
        throw new Error("The stored recipient vendor does not match this inbox.");
      }
      if (!identity.vendors.some((vendor) => vendor.id === vendorId)) {
        throw new Error("This session does not hold the matching vendor role.");
      }
      if (!realmVendorId) {
        throw new Error(
          "The public adapter did not expose a realm vendorId, so the read grant cannot be checked against keyId.",
        );
      }
      const expected = expectedGrantForDraft(
        "read",
        { context: selectedContext },
        realmVendorId,
      );
      assertPolicyForGrant(selected.readPolicy, expected);

      setBusy("decrypt");
      const result = await doDecrypt(
        [{ encrypted: selected.ciphertext, tags: [selectedContext.assignmentId] }],
        base64ToBytes(selected.readPolicy),
      );
      const text = decryptResultToText(result);
      const parsed = parseDecryptedReport(text, selectedContext);
      setDecrypted({ reportId: selectedContext.assignmentId, parsed });
    } catch (error) {
      if (error instanceof ApiError) setFailure({ kind: "api", error });
      else if (error instanceof PolicyValidationError) setFailure({ kind: "policy", error });
      else if (TideError.isTideError(error)) setFailure({ kind: "tide", error });
      else setFailure({ kind: "validation", error });
    } finally {
      setBusy(null);
    }
  }

  async function advanceStatus() {
    if (!selected) return;
    const next = nextReportStatus(selected.status);
    if (!next) return;
    setBusy("triage");
    setFailure(null);
    setNotice("");
    try {
      const data = await api(`/api/reports/${encodeURIComponent(selected.context.assignmentId)}`, {
        method: "PATCH",
        body: { status: next, expectedVersion: selected.stateVersion },
      });
      setNotice(
        `Status updated to ${statusLabel(data?.report?.status ?? next)}. The report content did not change.`,
      );
      reports.reload();
    } catch (error) {
      if (error instanceof ApiError) setFailure({ kind: "api", error });
      else setFailure({ kind: "validation", error });
    } finally {
      setBusy(null);
    }
  }

  const sameReportDecrypted =
    Boolean(selected) && decrypted?.reportId === selected.context?.assignmentId;
  const next = selected ? nextReportStatus(selected.status) : null;

  if (identity.vendors.length === 0) {
    return (
      <section className="panel" role="alert">
        <span className="eyebrow">ROLE REQUIRED</span>
        <h2>No vendor role in this identity</h2>
        <p>The API will reject vendor inbox requests without the matching realm vendor role.</p>
      </section>
    );
  }

  return (
    <div className="view">
      <SectionHeading
        eyebrow="VENDOR INBOX"
        title="Decrypt and triage"
        description="The inbox is filtered by the API to the stored recipient vendor. Decryption runs in this browser with the stored signed read grant, then the decrypted context is compared before anything is rendered."
        actions={
          <button
            className="btn btn-secondary"
            type="button"
            onClick={reports.reload}
            disabled={reports.status === "loading"}
          >
            {reports.status === "loading" ? "Refreshing…" : "Refresh inbox"}
          </button>
        }
      />

      {vendors.length > 1 ? (
        <div className="toolbar-row">
          <Field label="Vendor inbox" htmlFor="vendor-select">
            <select
              id="vendor-select"
              value={vendorId}
              onChange={(event) => setVendorId(event.target.value)}
            >
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="field-hint">
            Only vendors present as realm roles in the verified token are listed.
          </p>
        </div>
      ) : (
        <p className="field-hint">
          Inbox recipient: <strong>{vendorName(vendorId)}</strong> · role{" "}
          <code>{vendors[0]?.role}</code>
        </p>
      )}

      {notice ? (
        <Notice tone="positive" title="Status updated" onDismiss={() => setNotice("")}>
          {notice}
        </Notice>
      ) : null}
      {failure?.kind === "api" ? (
        <ErrorPanel
          error={failure.error}
          title="The inbox request failed"
          onRetry={failure.error?.status === 409 ? reports.reload : undefined}
          retryLabel="Reload inbox"
        />
      ) : null}
      {failure?.kind === "tide" ? <TideFailurePanel error={failure.error} /> : null}
      {failure?.kind === "policy" ? (
        <div className="panel panel-error" role="alert">
          <span className="eyebrow">READ GRANT MISMATCH</span>
          <h2>Decryption blocked</h2>
          <p>
            The stored read policy does not structurally match this report and vendor. The browser
            refuses to call the SDK with an unverified grant.
          </p>
          <PolicyIssues issues={failure.error.issues} />
        </div>
      ) : null}
      {failure?.kind === "validation" ? (
        <ErrorPanel error={failure.error} title="Decryption blocked" />
      ) : null}

      {reports.status === "error" ? (
        <ErrorPanel error={reports.error} title="Could not load the inbox" onRetry={reports.reload} />
      ) : reports.status === "loading" && !reports.data ? (
        <LoadingBlock label="Loading vendor reports…" />
      ) : list.length === 0 ? (
        <section className="panel">
          <div className="empty-state">
            <h3>No reports for {vendorName(vendorId)}</h3>
            <p>
              Nothing is routed to this vendor in the exchange. Reports will appear here after a
              researcher submits ciphertext for this recipient.
            </p>
          </div>
        </section>
      ) : (
        <div className="workspace">
          <aside className="workspace-list">
            <section className="panel flush">
              <div className="panel-heading compact">
                <div>
                  <span className="eyebrow">ROUTED REPORTS</span>
                  <h2>{vendorName(vendorId)}</h2>
                </div>
                <span className="pill pill-neutral">{list.length}</span>
              </div>
              <div className="list-stack">
                {list.map((report) => {
                  const reportId = report.context?.assignmentId;
                  const active = reportId === selectedReportId;
                  return (
                    <button
                      key={reportId}
                      className={`list-item ${active ? "selected" : ""}`}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedReportId(reportId)}
                    >
                      <span className="list-item-top">
                        <strong>Revision {report.context?.revision ?? "—"}</strong>
                        <StatusPill status={report.status} />
                      </span>
                      <span className="list-item-sub">{formatTimestamp(report.createdAt)}</span>
                      <span className="list-item-id mono">
                        {shortId(report.context?.assignmentId, 10, 6)}
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
                <h2>No report selected</h2>
              </section>
            ) : (
              <>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">ENCRYPTED RECORD</span>
                      <h2>Revision {selected.context.revision}</h2>
                      <p>
                        Created {formatTimestamp(selected.createdAt)} · state version{" "}
                        {selected.stateVersion}
                      </p>
                    </div>
                    <StatusPill status={selected.status} />
                  </div>

                  <MetaGrid
                    items={[
                      {
                        label: "Assignment",
                        value: selected.context.assignmentId,
                        mono: true,
                        spanAll: true,
                      },
                      { label: "Vendor", value: vendorName(selected.context.vendorId) },
                      { label: "Owner subject", value: selected.context.ownerSub, mono: true, spanAll: true },
                      {
                        label: "Ciphertext length",
                        value: `${selected.ciphertext?.length ?? 0} characters`,
                      },
                      {
                        label: "Read grant",
                        value: selected.readPolicy
                          ? `${policyInspection?.summary?.signatureBytes ?? 0}-byte signature`
                          : "missing",
                      },
                    ]}
                  />

                  {policyInspection?.issues.length ? (
                    <PolicyIssues issues={policyInspection.issues} />
                  ) : null}

                  <div className="action-row">
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={decryptReport}
                      disabled={busy === "decrypt" || !selected.readPolicy}
                    >
                      {busy === "decrypt" ? "Decrypting in browser…" : "Decrypt report"}
                    </button>
                    {decrypted ? (
                      <button className="btn btn-ghost" type="button" onClick={() => setDecrypted(null)}>
                        Clear decrypted text
                      </button>
                    ) : null}
                    <span className="field-hint">
                      The plaintext is held in this component only and is discarded on selection change
                      or sign-out.
                    </span>
                  </div>
                </section>

                {sameReportDecrypted ? (
                  <article className="panel plaintext-panel">
                    <div className="panel-heading">
                      <div>
                        <span className="eyebrow">DECRYPTED IN THIS BROWSER</span>
                        <h2>{decrypted.parsed.title}</h2>
                      </div>
                      <span className="pill pill-attention">{decrypted.parsed.severity}</span>
                    </div>
                    <p className="field-hint">
                      Decrypted context matched the requested report for domain, realm, ids, revision,
                      assignment and vendor. Rendered as escaped text only.
                    </p>
                    <div className="plaintext-section">
                      <h3>Details</h3>
                      <pre className="plaintext-block">{decrypted.parsed.details}</pre>
                    </div>
                    <div className="plaintext-section">
                      <h3>Proof of concept</h3>
                      {decrypted.parsed.poc ? (
                        <pre className="plaintext-block">{decrypted.parsed.poc}</pre>
                      ) : (
                        <p className="muted">No proof of concept supplied.</p>
                      )}
                    </div>
                    <details className="inline-details">
                      <summary>Decrypted context</summary>
                      <ContextMeta context={decrypted.parsed} />
                    </details>
                  </article>
                ) : null}

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">TRIAGE</span>
                      <h2>Progress status</h2>
                      <p>
                        Only the legal forward transition is offered. The API requires the matching
                        stored vendor and an expected state version.
                      </p>
                    </div>
                    <StatusPill status={selected.status} />
                  </div>
                  {next ? (
                    <div className="action-row">
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={advanceStatus}
                        disabled={!sameReportDecrypted || busy === "triage"}
                      >
                        {busy === "triage" ? "Updating…" : nextStatusLabel(selected.status)}
                      </button>
                      {!sameReportDecrypted ? (
                        <span className="field-hint">
                          Decrypt this report in the current session before changing its status.
                        </span>
                      ) : (
                        <span className="field-hint">
                          Status text is routing metadata, not proof that a fix was independently
                          verified.
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="muted">This report is already at the final status: fixed.</p>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      )}

      <p className="view-footnote">
        A missing operation role or an app-side filter is not evidence of denial. Use Direct probe for
        an SDK-level decrypt attempt with supplied ciphertext and policy bytes.
      </p>
    </div>
  );
}
