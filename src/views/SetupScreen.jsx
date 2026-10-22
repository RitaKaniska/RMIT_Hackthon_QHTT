import { ErrorPanel, Notice, Spinner } from "../components/ui.jsx";
import { SetupChecks } from "./SetupView.jsx";
import DisclosureScene from "../components/DisclosureScene.jsx";

function PublicBrand() {
  return (
    <a className="public-brand" href="/" onClick={(event) => event.preventDefault()}>
      <span className="brand-mark" aria-hidden="true">
        E
      </span>
      <span>
        <strong>Embargo</strong>
        <small>confidential disclosure exchange</small>
      </span>
    </a>
  );
}

export function BootScreen() {
  return (
    <div className="public-shell">
      <PublicBrand />
      <main id="main" className="public-main">
        <section className="public-card center-card" aria-busy="true">
          <span className="eyebrow">CONFIGURATION CHECK</span>
          <h1>Checking TideCloak setup</h1>
          <p>
            Loading <code>/api/setup</code> before mounting any authentication provider. No mock
            login path exists.
          </p>
          <Spinner label="Contacting the API…" />
        </section>
      </main>
    </div>
  );
}

export function SetupLoadError({ error, onRetry }) {
  return (
    <div className="public-shell">
      <PublicBrand />
      <main id="main" className="public-main">
        <ErrorPanel
          error={error}
          title="The setup endpoint could not be read"
          onRetry={onRetry}
          retryLabel="Retry setup check"
        />
        <section className="public-card">
          <h2>What this means</h2>
          <p>
            The application will not mount the TideCloak provider, create a local session, or fall
            back to plaintext. </p>
          <ul className="limit-list">
            <li>Confirm the API is running and <code>GET /api/setup</code> returns JSON.</li>
            <li>Confirm the Vite dev proxy sends <code>/api</code> to <code>127.0.0.1:3001</code>.</li>
            <li>A server that answers an API route with <code>index.html</code> is misconfigured.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

export default function SetupScreen({
  setup,
  onRefresh,
  refreshing,
  refreshError,
  configInvalid = false,
}) {
  const checks = Array.isArray(setup?.checks) ? setup.checks : [];
  const ready = checks.filter((check) => check.status === "ready").length;
  const appOrigin = setup?.appOrigin || "http://localhost:5137";

  return (
    <div className="public-shell">
      <PublicBrand />
      <main id="main" className="public-main">
        <section className="public-hero">
          <div className="setup-intro">
            <div>
              <span className="channel-label">Your private disclosure channel</span>
              <h1>Connect your disclosure workspace.</h1>
              <p>
                Finish the TideCloak configuration to enable sign-in and encrypted reports.
                The checks below show what still needs attention.
              </p>
              <div className="hero-actions">
                <button className="btn btn-light" type="button" onClick={onRefresh} disabled={refreshing}>
                  {refreshing ? "Re-checking…" : "Re-check setup"}
                </button>
                <a className="btn btn-outline-light" href="/api/setup" target="_blank" rel="noreferrer noopener">
                  Read /api/setup
                </a>
              </div>
            </div>
            <DisclosureScene />
          </div>
        </section>

        {refreshError ? (
          <ErrorPanel
            error={refreshError}
            title="Setup re-check failed"
            onRetry={onRefresh}
            retryLabel="Try again"
          />
        ) : null}

        {configInvalid ? (
          <Notice tone="danger" title="Configured flag without a usable public adapter">
            <code>/api/setup</code> reported <code>configured: true</code>, but the returned value did
            not contain the realm or server fields the SDK provider needs. The provider is not mounted
            and no login is attempted.
          </Notice>
        ) : null}

        <div className="grid grid-2">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">SERVER DIAGNOSTICS</span>
                <h2>Setup checks</h2>
              </div>
              <span className={`pill pill-${ready === checks.length && checks.length > 0 ? "positive" : "attention"}`}>
                {ready}/{checks.length || 0} ready
              </span>
            </div>
            <SetupChecks checks={checks} />
            <dl className="inline-meta">
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
            <span className="eyebrow">SETUP PATH</span>
            <h2>Connect TideCloak</h2>
            <ol className="setup-steps">
              <li>
                <strong>Run TideCloak</strong>
                <p>Start the TideCloak instance and complete realm/application setup in its console.</p>
              </li>
              <li>
                <strong>Create the roles</strong>
                <p>
                  Realm roles: <code>researcher</code>, <code>vendor-kettle</code>,
                  <code>vendor-acme</code>, <code>operator</code>, <code>tide-realm-admin</code>,
                  <code>_tide_encryptor</code>, <code>_tide_decryptor</code>. Configure QEA separately
                  with the real admin roster.
                </p>
              </li>
              <li>
                <strong>Register exact URIs</strong>
                <p>
                  Web origin <code>{appOrigin}</code>, callback{" "}
                  <code>{appOrigin}/auth/redirect</code>, silent helper{" "}
                  <code>{appOrigin}/silent-check-sso.html</code>.
                </p>
              </li>
              <li>
                <strong>Supply the public adapter</strong>
                <p>
                  Save the downloaded public client adapter at <code>TIDE_ADAPTER_PATH</code>{" "}
                  (default <code>config/tidecloak.json</code>, outside <code>public/</code> and{" "}
                  <code>dist/</code>) and restart the API. Never place a client secret or private key
                  there.
                </p>
              </li>
              <li>
                <strong>Re-check</strong>
                <p>
                  The provider mounts only when the returned config is valid, public and includes the
                  realm/resource/vendor fields the SDK needs.
                </p>
              </li>
            </ol>
          </section>
        </div>

        <Notice tone="info" title="Protected APIs remain unavailable">
          Until configuration is valid, protected API routes return a configuration error rather than
          accepting unauthenticated work. This page does not create local roles or report data.
        </Notice>

        <section className="panel">
          <span className="eyebrow">CONFIGURATION CONTRACT</span>
          <h2>Environment values</h2>
          <dl className="meta-grid">
            <div>
              <dt>APP_ORIGIN</dt>
              <dd className="mono">{setup?.appOrigin || "not reported"}</dd>
            </div>
            <div>
              <dt>EMBARGO_AUDIENCE</dt>
              <dd className="mono">{setup?.apiAudience || "not reported"}</dd>
            </div>
            <div className="span-all">
              <dt>TIDE_ADAPTER_PATH</dt>
              <dd className="mono">default: config/tidecloak.json</dd>
            </div>
            <div className="span-all">
              <dt>Realm issuer</dt>
              <dd className="mono">{setup?.realmIssuer || "not reported"}</dd>
            </div>
          </dl>
          <p className="field-hint">
            The API is on loopback <code>127.0.0.1:3001</code> in development; the browser keeps{" "}
            <code>{appOrigin}</code> so OIDC origin matching stays literal.
          </p>
        </section>
      </main>
    </div>
  );
}
