import { ErrorPanel, Notice, SectionHeading } from "../components/ui.jsx";
import { consoleLinkFromConfig } from "../lib/util.js";

export function SetupChecks({ checks, className }) {
  const list = Array.isArray(checks) ? checks : [];
  if (list.length === 0) {
    return <p className="muted">The API did not return any setup checks.</p>;
  }
  return (
    <ul className={`check-list ${className || ""}`}>
      {list.map((check) => {
        const tone =
          check.status === "ready" ? "positive" : check.status === "missing" ? "attention" : "danger";
        return (
          <li key={check.id || check.label}>
            <span className={`check-dot check-${tone}`} aria-hidden="true" />
            <div>
              <div className="check-title-row">
                <strong>{check.label || check.id || "Check"}</strong>
                <span className={`pill pill-${tone}`}>{check.status || "unknown"}</span>
              </div>
              {check.detail ? <p>{check.detail}</p> : null}
              {check.id ? <span className="table-sub mono">{check.id}</span> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PublicConfigSummary({ config }) {
  if (!config || typeof config !== "object") {
    return <p className="muted">No public adapter configuration was returned.</p>;
  }
  const server = config["auth-server-url"] || config.authServerUrl || config.url || "";
  const resource = config.resource || config.clientId || "";
  const vendorId = config.vendorId || config["vendor-id"] || "";
  return (
    <dl className="meta-grid">
      <div>
        <dt>Realm</dt>
        <dd className="mono">{config.realm || "not present"}</dd>
      </div>
      <div>
        <dt>Client / resource</dt>
        <dd className="mono">{resource || "not present"}</dd>
      </div>
      <div className="span-all">
        <dt>Auth server URL</dt>
        <dd className="mono">{server || "not present"}</dd>
      </div>
      <div className="span-all">
        <dt>Realm vendor id</dt>
        <dd className="mono">{vendorId || "not present"}</dd>
      </div>
    </dl>
  );
}

export default function SetupView({
  setup,
  identity,
  onRefreshSetup: onRefresh,
  refreshingSetup: refreshing,
  refreshSetupError: refreshError,
}) {
  const checks = Array.isArray(setup?.checks) ? setup.checks : [];
  const ready = checks.filter((check) => check.status === "ready").length;
  const consoleUrl = consoleLinkFromConfig(setup?.config);
  const appOrigin = setup?.appOrigin || "not reported";

  return (
    <div className="view">
      <SectionHeading
        eyebrow="SETUP & TRUST BOUNDARIES"
        title="Environment and provider configuration"
        description="The SPA fetches /api/setup before mounting the TideCloak provider. Only a valid public adapter returned by the API is passed to the provider; no second login convention exists."
        actions={
          <button className="btn btn-secondary" type="button" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Re-checking…" : "Re-check setup"}
          </button>
        }
      />

      {refreshError ? (
        <ErrorPanel
          error={refreshError}
          title="Setup re-check failed"
          onRetry={onRefresh}
          retryLabel="Try again"
        />
      ) : null}

      <div className="grid grid-2">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">API DIAGNOSTICS</span>
              <h2>Setup checks</h2>
            </div>
            <span className={`pill pill-${ready === checks.length && checks.length > 0 ? "positive" : "attention"}`}>
              {ready}/{checks.length || 0} ready
            </span>
          </div>
          <SetupChecks checks={checks} />
          <dl className="inline-meta">
            <div>
              <dt>Configured</dt>
              <dd>{setup?.configured ? "true" : "false"}</dd>
            </div>
            <div>
              <dt>API audience</dt>
              <dd className="mono">{setup?.apiAudience || "not reported"}</dd>
            </div>
            <div>
              <dt>Realm issuer</dt>
              <dd className="mono">{setup?.realmIssuer || "not reported"}</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">PUBLIC ADAPTER</span>
              <h2>What the browser received</h2>
            </div>
          </div>
          <PublicConfigSummary config={setup?.config} />
          <p className="field-hint">
            This is client metadata only. The API must never return a client secret, private JWK,
            admin credential or full server export here.
          </p>
          {identity?.admin && consoleUrl ? (
            <div className="callout callout-info">
              <strong>TideCloak console</strong>
              <p>
                Opened from the trusted adapter configuration. QEA and role work happen in the real
                console; this app does not manage roles locally.
              </p>
              <a className="btn btn-secondary" href={consoleUrl} target="_blank" rel="noreferrer noopener">
                Open {consoleUrl}
              </a>
            </div>
          ) : identity?.admin ? (
            <Notice tone="warning" title="No trusted console URL">
              The returned public adapter does not expose a usable http(s) auth-server URL, so the app
              will not guess one.
            </Notice>
          ) : (
            <p className="field-hint">
              The direct TideCloak console link is shown only to identities with the verified admin
              role.
            </p>
          )}
        </section>
      </div>

      <section className="panel">
        <span className="eyebrow">CALLBACK REGISTRATION</span>
        <h2>Values that must match the realm</h2>
        <p>
          OIDC origin matching is literal. Register the browser origin, not the API proxy target.
        </p>
        <dl className="meta-grid">
          <div className="span-all">
            <dt>Web origin</dt>
            <dd className="mono">{appOrigin}</dd>
          </div>
          <div className="span-all">
            <dt>Login / logout callback</dt>
            <dd className="mono">{appOrigin === "not reported" ? "—" : `${appOrigin}/auth/redirect`}</dd>
          </div>
          <div className="span-all">
            <dt>Silent SSO helper</dt>
            <dd className="mono">{appOrigin === "not reported" ? "—" : `${appOrigin}/silent-check-sso.html`}</dd>
          </div>
        </dl>
        <p className="field-hint">
          The helper is committed in <code>public/silent-check-sso.html</code>. The provider handles
          <code> /auth/redirect</code> after initialization.
        </p>
      </section>

      <section className="panel">
        <span className="eyebrow">EVIDENCE STATES</span>
        <h2>Keep these separate</h2>
        <div className="grid grid-3 compact-grid">
          <article className="mini-card">
            <strong>Login</strong>
            <p>An actual SDK session and bearer token. Shown from the provider state, not a local persona.</p>
          </article>
          <article className="mini-card">
            <strong>Request initialized</strong>
            <p>Encoded policy-request bytes persisted by the API. This is not a signature.</p>
          </article>
          <article className="mini-card">
            <strong>Signature stored</strong>
            <p>A signature returned by the execution helper and attached to the exact requested policy.</p>
          </article>
          <article className="mini-card">
            <strong>Decryption observed</strong>
            <p>A real SDK decrypt result for the ciphertext, tag and policy. It is the only decrypt evidence.</p>
          </article>
        </div>
        <p className="field-hint">
          A successful build, a mounted provider, an opened approval window or a stored policy is not
          evidence of network acceptance. Use the direct probe for independent decrypt attempts.
        </p>
      </section>
    </div>
  );
}
