import { EmptyState, MetaGrid, StatusPill } from "./ui.jsx";
import {
  boundedText,
  formatTimestamp,
  shortId,
  vendorName,
} from "../lib/util.js";

export function SubmissionTable({ reports, emptyTitle, emptyBody }) {
  if (!Array.isArray(reports) || reports.length === 0) {
    return (
      <EmptyState title={emptyTitle || "No submissions yet"}>
        {emptyBody || "Submitted reports appear here as metadata only."}
      </EmptyState>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <caption className="sr-only">
          Submitted report metadata. The exchange does not decrypt report contents.
        </caption>
        <thead>
          <tr>
            <th scope="col">Vendor</th>
            <th scope="col">Revision</th>
            <th scope="col">Assignment</th>
            <th scope="col">Status</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const context = report?.context ?? {};
            const key = context.assignmentId || `${context.reportId}-${context.revision}`;
            return (
              <tr key={key}>
                <td>
                  <strong>{vendorName(context.vendorId)}</strong>
                  <span className="table-sub">vendor id: {context.vendorId || "unknown"}</span>
                </td>
                <td className="mono">{context.revision ?? "—"}</td>
                <td className="mono" title={context.assignmentId || ""}>
                  {shortId(context.assignmentId, 10, 6)}
                </td>
                <td>
                  <StatusPill status={report.status} />
                </td>
                <td>{formatTimestamp(report.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ContextMeta({ context }) {
  if (!context) return null;
  return (
    <MetaGrid
      items={[
        { label: "Domain", value: context.domain, mono: true },
        { label: "Realm issuer", value: context.realm, mono: true, spanAll: true },
        { label: "Report id", value: context.reportId, mono: true, spanAll: true },
        { label: "Revision", value: context.revision, mono: true },
        { label: "Vendor id", value: context.vendorId, mono: true },
        { label: "Assignment id", value: context.assignmentId, mono: true, spanAll: true },
        { label: "Owner issuer", value: context.ownerIss, mono: true, spanAll: true },
        { label: "Owner subject", value: context.ownerSub, mono: true, spanAll: true },
        { label: "Writer key", value: context.writerKey, mono: true, spanAll: true },
      ]}
    />
  );
}

export function ActivityList({ activity }) {
  if (!Array.isArray(activity) || activity.length === 0) {
    return (
      <EmptyState title="No local activity recorded">
        The API returns only its own local activity table. It is not a tamper-proof audit trail.
      </EmptyState>
    );
  }

  return (
    <ol className="activity-list">
      {activity.map((entry, index) => {
        const time = entry?.time ?? entry?.createdAt ?? entry?.at ?? null;
        const action = entry?.action ?? entry?.event ?? entry?.type ?? "activity";
        const actor = entry?.actor ?? entry?.actorSub ?? entry?.sub ?? entry?.ownerSub ?? "";
        const detail = entry?.detail ?? entry?.message ?? entry?.reason ?? "";
        const assignment = entry?.assignmentId ?? entry?.target ?? entry?.reportId ?? "";
        return (
          <li key={entry?.id ?? `${time ?? "event"}-${index}`}>
            <time>{time ? formatTimestamp(time) : "Unknown time"}</time>
            <span className="activity-dot" aria-hidden="true" />
            <div>
              <strong>{boundedText(String(action), 120)}</strong>
              {detail ? <p>{boundedText(String(detail), 600)}</p> : null}
              {assignment ? (
                <p className="mono activity-target">{boundedText(String(assignment), 200)}</p>
              ) : null}
            </div>
            <span className="activity-actor">{actor ? boundedText(String(actor), 120) : "—"}</span>
          </li>
        );
      })}
    </ol>
  );
}
