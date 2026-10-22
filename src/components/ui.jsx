import { apiErrorInfo } from "../lib/api.js";
import { classifyTideError } from "../lib/tide.js";
import { cx, statusLabel, statusTone } from "../lib/util.js";

export function Spinner({ label = "Loading" }) {
  return (
    <span className="spinner" role="status" aria-live="polite">
      <span className="spinner-ring" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function LoadingBlock({ label = "Loading…", children }) {
  return (
    <div className="state-block" aria-busy="true">
      <Spinner label={label} />
      {children ? <p className="state-detail">{children}</p> : null}
    </div>
  );
}

export function Notice({ tone = "info", title, children, onDismiss, live = true }) {
  return (
    <div
      className={cx("notice", `notice-${tone}`)}
      role={live ? (tone === "danger" ? "alert" : "status") : undefined}
    >
      <div className="notice-copy">
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {onDismiss ? (
        <button className="icon-button" type="button" onClick={onDismiss} aria-label="Dismiss message">
          ×
        </button>
      ) : null}
    </div>
  );
}

export function ErrorPanel({ error, title = "Something went wrong", onRetry, retryLabel = "Retry" }) {
  const info = apiErrorInfo(error);
  return (
    <div className="panel panel-error" role="alert">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">REQUEST FAILED</span>
          <h2>{title}</h2>
        </div>
        {info.status ? <span className="pill pill-danger">HTTP {info.status}</span> : null}
      </div>
      <p>{info.message}</p>
      <dl className="inline-meta">
        <div>
          <dt>Code</dt>
          <dd className="mono">{info.code}</dd>
        </div>
        {info.status ? (
          <div>
            <dt>Status</dt>
            <dd className="mono">{info.status}</dd>
          </div>
        ) : null}
      </dl>
      {onRetry ? (
        <button className="btn btn-secondary" type="button" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function TideFailurePanel({ error, children }) {
  const info = classifyTideError(error);
  const hint =
    info.kind === "threshold"
      ? "Tide's relationship-policy guidance documents a threshold failure as a possible contract refusal, with the underlying message in the cause. Inspect it and compare against a positive control; this is not automatically an outage, and it is not a governance verdict on its own."
      : info.kind === "network"
        ? "This is an operational network/endpoint failure. Do not count it as an access denial, a signature, or a successful grant."
        : info.kind === "validation"
          ? "Local parsing or cryptographic validation failed. This is not an authorisation verdict."
          : "This is the observed SDK error. No access conclusion is inferred by the interface.";
  return (
    <div className="panel panel-error" role="alert">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">TIDE SDK ERROR</span>
          <h2>Observed failure</h2>
        </div>
        <span className="pill pill-danger">{info.kind}</span>
      </div>
      <p>{info.message}</p>
      <dl className="meta-grid">
        {info.code ? (
          <div>
            <dt>Error code</dt>
            <dd className="mono">{info.code}</dd>
          </div>
        ) : null}
        {info.httpStatus ? (
          <div>
            <dt>HTTP status</dt>
            <dd className="mono">{info.httpStatus}</dd>
          </div>
        ) : null}
        {info.traceId ? (
          <div>
            <dt>Trace id</dt>
            <dd className="mono">{info.traceId}</dd>
          </div>
        ) : null}
        {info.detailsCount > 0 ? (
          <div>
            <dt>Underlying attempts</dt>
            <dd>{info.detailsCount}</dd>
          </div>
        ) : null}
        {info.cause ? (
          <div className="span-all">
            <dt>Cause</dt>
            <dd className="mono">{info.cause}</dd>
          </div>
        ) : null}
      </dl>
      <p className="muted">{hint}</p>
      {children}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty-state">
      <span className="empty-mark" aria-hidden="true" />
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function StatusPill({ status }) {
  return <span className={cx("pill", `pill-${statusTone(status)}`)}>{statusLabel(status)}</span>;
}

export function RoleChips({ roles, empty = "No app roles in this token" }) {
  if (!roles || roles.length === 0) return <span className="muted">{empty}</span>;
  return (
    <span className="chip-row">
      {roles.map((role) => (
        <span className="chip" key={role}>
          {role}
        </span>
      ))}
    </span>
  );
}

export function SectionHeading({ eyebrow, title, description, actions }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="section-actions">{actions}</div> : null}
    </div>
  );
}

export function MetaGrid({ items, className }) {
  return (
    <dl className={cx("meta-grid", className)}>
      {items
        .filter((item) => item && item.value !== undefined && item.value !== null && item.value !== "")
        .map((item) => (
          <div key={item.label} className={item.spanAll ? "span-all" : undefined}>
            <dt>{item.label}</dt>
            <dd className={item.mono ? "mono" : undefined}>{item.value}</dd>
          </div>
        ))}
    </dl>
  );
}

export function Stat({ label, value, detail }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {detail ? <span className="stat-detail">{detail}</span> : null}
    </div>
  );
}

export function Field({ label, htmlFor, hint, count, children, className }) {
  return (
    <div className={cx("field", className)}>
      <div className="field-label-row">
        <label htmlFor={htmlFor}>{label}</label>
        {count ? <span className="field-count">{count}</span> : null}
      </div>
      {children}
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function PolicySummary({ summary }) {
  if (!summary) return null;
  return (
    <dl className="meta-grid policy-grid">
      <div>
        <dt>Contract</dt>
        <dd className="mono">{summary.contractId || "(empty)"}</dd>
      </div>
      <div>
        <dt>Policy version</dt>
        <dd className="mono">{summary.version}</dd>
      </div>
      <div className="span-all">
        <dt>Model IDs</dt>
        <dd className="mono">{summary.modelIds.join(", ") || "(none)"}</dd>
      </div>
      <div className="span-all">
        <dt>Realm vendor key (keyId)</dt>
        <dd className="mono">{summary.keyId || "(empty)"}</dd>
      </div>
      <div>
        <dt>Subject type</dt>
        <dd>{summary.subjectType || "(empty)"}</dd>
      </div>
      <div className="span-all">
        <dt>Subject id</dt>
        <dd className="mono">{summary.subjectId || "(empty)"}</dd>
      </div>
      <div className="span-all">
        <dt>Record (assignmentId)</dt>
        <dd className="mono">{summary.recordId || "(empty)"}</dd>
      </div>
      <div>
        <dt>Operation roles</dt>
        <dd className="mono">{summary.roles ? summary.roles.join(", ") : "(invalid JSON)"}</dd>
      </div>
      <div>
        <dt>Execution</dt>
        <dd>{summary.executionType}</dd>
      </div>
      <div>
        <dt>Approval</dt>
        <dd>{summary.approvalType}</dd>
      </div>
      <div>
        <dt>Signature</dt>
        <dd>{summary.signed ? `${summary.signatureBytes} bytes` : "none"}</dd>
      </div>
      <div>
        <dt>Expiry</dt>
        <dd>{summary.expiry ? new Date(summary.expiry * 1000).toLocaleString() : "none"}</dd>
      </div>
      {summary.clientId ? (
        <div>
          <dt>Client id</dt>
          <dd className="mono">{summary.clientId}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export function PolicyIssues({ issues }) {
  if (!issues || issues.length === 0) return null;
  return (
    <div className="policy-issues" role="alert">
      <strong>Policy does not match the intended grant</strong>
      <ul>
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </div>
  );
}
