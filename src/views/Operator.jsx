import { useMemo, useState } from "react";
import {
  EmptyState,
  ErrorPanel,
  LoadingBlock,
  MetaGrid,
  Notice,
  SectionHeading,
  Stat,
  StatusPill,
} from "../components/ui.jsx";
import { ActivityList, ContextMeta } from "../components/reports.jsx";
import { useAsyncData } from "../lib/hooks.js";
import { describePolicyBase64 } from "../lib/tide.js";
import { formatTimestamp, shortId, vendorName } from "../lib/util.js";

function policyHint(base64) {
  if (typeof base64 !== "string" || base64.length === 0) return null;
  try {
    const summary = describePolicyBase64(base64);
    return `${summary.signatureBytes}-byte signature · ${summary.contractId || "unknown contract"}`;
  } catch {
    return "present but unreadable";
  }
}

export default function Operator({ identity, api }) {
  const raw = useAsyncData(() => api("/api/operator/raw"), `operator-raw:${identity.key}`);
  const [query, setQuery] = useState("");
  const reports = Array.isArray(raw.data?.reports) ? raw.data.reports : [];
  const activity = Array.isArray(raw.data?.activity) ? raw.data.activity : [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return reports;
    return reports.filter((report) => {
      const context = report.context ?? {};
      return [
        context.assignmentId,
        context.reportId,
        context.vendorId,
        context.ownerSub,
        report.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [reports, query]);

  const totalCiphertext = reports.reduce(
    (sum, report) => sum + (typeof report.ciphertext === "string" ? report.ciphertext.length : 0),
    0,
  );

  return (
    <div className="view">
      <SectionHeading
        eyebrow="OPERATOR STORAGE VIEW"
        title="Ciphertext and disclosed metadata"
        description="This is the exchange operator's honest view: routing metadata, ciphertext and the API's local activity table. No report plaintext and no raw signing requests or tokens are returned here."
        actions={
          <button
            className="btn btn-secondary"
            type="button"
            onClick={raw.reload}
            disabled={raw.status === "loading"}
          >
            {raw.status === "loading" ? "Refreshing…" : "Refresh raw view"}
          </button>
        }
      />

      <Notice tone="warning" title="Local activity is not tamper-proof">
        The database owner can rewrite, reorder or delete rows. This is not a hash-chained or
        independently witnessed audit trail.
      </Notice>

      {raw.status === "error" ? (
        <ErrorPanel error={raw.error} title="Could not load the operator view" onRetry={raw.reload} />
      ) : raw.status === "loading" && !raw.data ? (
        <LoadingBlock label="Reading ciphertext metadata and local activity…" />
      ) : (
        <>
          <div className="stat-row">
            <Stat label="Stored reports" value={reports.length} />
            <Stat label="Activity rows" value={activity.length} />
            <Stat
              label="Ciphertext characters"
              value={totalCiphertext.toLocaleString()}
              detail="Routing metadata and sizes remain visible."
            />
            <Stat label="Vendor recipients" value={new Set(reports.map((r) => r.context?.vendorId)).size} />
          </div>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">RAW RECORDS</span>
                <h2>Stored ciphertext</h2>
              </div>
              <input
                className="filter-input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by assignment, report, vendor, owner, status"
                aria-label="Filter stored reports"
              />
            </div>

            {filtered.length === 0 ? (
              <EmptyState title="No matching ciphertext records">
                {reports.length === 0
                  ? "No report has been submitted through the real encryption flow yet."
                  : "Clear the filter to see all stored records."}
              </EmptyState>
            ) : (
              <div className="record-stack">
                {filtered.map((report) => {
                  const context = report.context ?? {};
                  const key = context.assignmentId || `${context.reportId}-${context.revision}`;
                  const policy = policyHint(report.readPolicy);
                  return (
                    <article className="record-card" key={key}>
                      <div className="record-head">
                        <div>
                          <span className="eyebrow">
                            {vendorName(context.vendorId)} · revision {context.revision}
                          </span>
                          <h3 className="mono">{shortId(context.assignmentId, 14, 8)}</h3>
                          <p className="muted">Created {formatTimestamp(report.createdAt)}</p>
                        </div>
                        <StatusPill status={report.status} />
                      </div>

                      <MetaGrid
                        items={[
                          {
                            label: "Ciphertext length",
                            value: `${(report.ciphertext || "").length} characters`,
                          },
                          { label: "State version", value: report.stateVersion },
                          { label: "Read policy", value: policy || "not returned" },
                          { label: "Vendor id", value: context.vendorId, mono: true },
                        ]}
                      />

                      <details className="inline-details">
                        <summary>Disclosed context metadata</summary>
                        <ContextMeta context={context} />
                      </details>

                      <details className="inline-details">
                        <summary>Raw ciphertext (no plaintext)</summary>
                        <pre className="ciphertext-block">{report.ciphertext || "(empty)"}</pre>
                      </details>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="panel">
            <span className="eyebrow">LOCAL ACTIVITY</span>
            <h2>Operator-owned event table</h2>
            <p>
              Values come from the API's local activity records. The API does not return raw signing
              requests or tokens in this view.
            </p>
            <ActivityList activity={activity} />
          </section>
        </>
      )}
    </div>
  );
}
