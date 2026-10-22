import { RoleChips } from "../components/ui.jsx";

export default function Overview({ setup, identity, navigate }) {
  const tasks = [
    ...(identity.researcher ? [
      { path: "/research", title: "Write a report", description: "Choose a vendor, prepare your finding and send it encrypted.", action: "New report" },
      { path: "/reports", title: "Follow your submissions", description: "Check whether a vendor has triaged or fixed a finding.", action: "My reports" },
    ] : []),
    ...(identity.vendors.length ? [
      { path: "/inbox", title: "Review incoming reports", description: "Decrypt findings sent to your team and update their status.", action: "Open inbox" },
    ] : []),
    ...(identity.admin ? [
      { path: "/admin", title: "Review access requests", description: "Review and sign the report policies waiting for approval.", action: "Review requests" },
    ] : []),
    ...(identity.operator ? [
      { path: "/operator", title: "Inspect stored records", description: "View encrypted records, routing information and local activity.", action: "View records" },
    ] : []),
  ];
  const checks = Array.isArray(setup?.checks) ? setup.checks : [];
  const ready = checks.filter((check) => check.status === "ready").length;

  return (
    <div className="view overview-view">
      <header className="desk-heading">
        <p className="desk-kicker">Your workspace</p>
        <h1>Welcome, {identity.name}.</h1>
        <p>Keep sensitive findings moving, from the first report to a fix.</p>
      </header>
      <div className="desk-layout">
        <section className="task-section" aria-labelledby="workspace-tasks">
          <h2 id="workspace-tasks">Pick up from here</h2>
          {tasks.length ? tasks.map((task) => (
            <div className="task-row" key={task.path}>
              <div><h3>{task.title}</h3><p>{task.description}</p></div>
              <button className="btn btn-secondary" type="button" onClick={() => navigate(task.path)}>{task.action}</button>
            </div>
          )) : (
            <div className="task-row"><div>
              <h3>Your account needs a workspace role</h3>
              <p>Ask your realm administrator for researcher, vendor or operator access.</p>
            </div></div>
          )}
        </section>
        <aside className="desk-aside">
          <section>
            <h2>Your access</h2>
            <RoleChips roles={identity.appRoles} empty="No workspace roles assigned" />
            <p>These roles belong to your TideCloak account.</p>
          </section>
          <section>
            <h2>Connection</h2>
            <p>{ready} of {checks.length} configuration checks ready.</p>
            <button className="text-action" type="button" onClick={() => navigate("/setup")}>View setup details</button>
            <p className="field-hint">Configuration checks do not verify encryption or decryption.</p>
          </section>
        </aside>
      </div>
      <section className="disclosure-note">
        <h2>What stays confidential</h2>
        <p>Report titles, severity, details and proof of concept are encrypted in the sender’s browser.
          The exchange stores encrypted content; routing information and status remain visible.</p>
        <details>
          <summary>Prototype limits</summary>
          <p>Use synthetic findings only. Live policy enforcement and resistance to a lone administrator
            still need verification. Local activity can be changed by the storage operator. Trusted
            client code is required, and recipients can retain decrypted copies.</p>
        </details>
      </section>
    </div>
  );
}
