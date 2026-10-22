import { ErrorPanel, LoadingBlock, Notice, SectionHeading, Stat } from "../components/ui.jsx";
import { SubmissionTable } from "../components/reports.jsx";
import { useAsyncData } from "../lib/hooks.js";

export default function MyReports({ identity, api }) {
  const reports = useReports(api, identity);

  return (
    <div className="view">
      <SectionHeading
        eyebrow="RESEARCHER STATUS"
        title="Your submissions"
        description="Authenticated owner metadata only. This page cannot decrypt report contents; the exchange holds no plaintext read-back grant for the researcher."
        actions={
          <button className="btn btn-secondary" type="button" onClick={reports.reload} disabled={reports.status === "loading"}>
            {reports.status === "loading" ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      <Notice tone="info" title="Visible metadata is not the report">
        Vendor, revision, assignment, status and timestamps remain visible to the exchange. Title,
        severity, details and proof of concept stay encrypted and are not available on this page.
      </Notice>

      {reports.status === "error" ? (
        <ErrorPanel error={reports.error} title="Could not load your submissions" onRetry={reports.reload} />
      ) : reports.status === "loading" && !reports.data ? (
        <LoadingBlock label="Loading submission metadata…" />
      ) : (
        <>
          <div className="stat-row">
            <Stat label="Submissions" value={reports.data?.reports?.length ?? 0} />
            <Stat
              label="Received"
              value={(reports.data?.reports ?? []).filter((report) => report.status === "received").length}
            />
            <Stat
              label="Triaged"
              value={(reports.data?.reports ?? []).filter((report) => report.status === "triaged").length}
            />
            <Stat
              label="Fixed"
              value={(reports.data?.reports ?? []).filter((report) => report.status === "fixed").length}
            />
          </div>
          <section className="panel">
            <SubmissionTable
              reports={reports.data?.reports}
              emptyTitle="No submitted reports"
              emptyBody="After a draft has both signed grants and you submit ciphertext, its status is listed here."
            />
          </section>
        </>
      )}
    </div>
  );
}

function useReports(api, identity) {
  return useAsyncData(() => api("/api/reports/mine"), `my-reports:${identity.key}`);
}
