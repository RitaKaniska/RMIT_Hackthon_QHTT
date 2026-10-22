import { RoleChips } from "../components/ui.jsx";
import { formatDurationSeconds } from "../lib/util.js";

function CheckSummary({ setup, onOpen }) {
  const checks = Array.isArray(setup?.checks) ? setup.checks : [];
  const ready = checks.filter((check) => check.status === "ready").length;
  const missing = checks.filter((check) => check.status !== "ready").length;
  return (
    <div className="setup-summary">
      <div>
        <span className="eyebrow">SETUP READINESS</span>
        <strong>
          {ready} of {checks.length || 0} checks ready
        </strong>
        <p>
          {checks.length === 0
            ? "The API returned no setup checks. That is not evidence of a working realm; inspect /api/setup directly."
            : missing > 0
              ? `${missing} check${missing === 1 ? "" : "s"} still report a problem. The API remains the authority for every request.`
              : "The API reports its public adapter configuration as ready. That is configuration evidence, not proof that encryption, signing or decryption has succeeded."}
        </p>
      </div>
      <button className="btn btn-secondary" type="button" onClick={onOpen}>
        Open setup details
      </button>
    </div>
  );
}

export default function Overview({ setup, identity, navigate }) {
  const checks = Array.isArray(setup?.checks) ? setup.checks : [];
  const ready = checks.filter((check) => check.status === "ready").length;
  const writeRoles = identity.appRoles;

  return (
    <div className="view">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow light">CONFIDENTIAL DISCLOSURE EXCHANGE</span>
          <h1>
            Send the finding.
            <br />
            Not the file.
          </h1>
          <p>
            A researcher encrypts a synthetic report in the browser under a signed record policy.
            The exchange stores ciphertext and routing metadata. The selected vendor decrypts in
            its own browser; the storage operator cannot read the report through this app.
          </p>
          <div className="hero-actions">
            {identity.researcher ? (
              <button className="btn btn-light" type="button" onClick={() => navigate("/research")}>
                Start a researcher draft
              </button>
            ) : null}
            {identity.vendors.length > 0 ? (
              <button className="btn btn-outline-light" type="button" onClick={() => navigate("/inbox")}>
                Open vendor inbox
              </button>
            ) : null}
            {identity.admin ? (
              <button className="btn btn-outline-light" type="button" onClick={() => navigate("/admin")}>
                Review policy signing
              </button>
            ) : null}
            {identity.operator ? (
              <button className="btn btn-outline-light" type="button" onClick={() => navigate("/operator")}>
                Inspect stored ciphertext
              </button>
            ) : null}
          </div>
        </div>
        <div className="hero-panel" aria-label="What each party can see">
          <span className="card-kicker">THE SPLIT</span>
          <div className="split-row">
            <span className="split-label">Exchange / operator</span>
            <strong>Ciphertext + routing metadata</strong>
          </div>
          <div className="split-divider" />
          <div className="split-row">
            <span className="split-label">Researcher</span>
            <strong>Plaintext in the authoring tab</strong>
          </div>
          <div className="split-divider" />
          <div className="split-row">
            <span className="split-label">Selected vendor</span>
            <strong>Decrypts with a signed read grant</strong>
          </div>
          <p className="hero-footnote">
            Network enforcement is evaluated by the Tide SDK. This interface does not simulate votes,
            roles or approvals.
          </p>
        </div>
      </section>

      <div className="grid grid-3">
        <article className="panel identity-panel">
          <span className="eyebrow">CURRENT IDENTITY</span>
          <h2>{identity.name}</h2>
          <p className="muted">
            {identity.username ? `@${identity.username}` : "No preferred_username claim"}
          </p>
          <dl className="meta-grid compact">
            <div className="span-all">
              <dt>Issuer</dt>
              <dd className="mono">{identity.iss || "not present in access token"}</dd>
            </div>
            <div className="span-all">
              <dt>Subject</dt>
              <dd className="mono">{identity.sub || "not present in access token"}</dd>
            </div>
            <div>
              <dt>Token lifetime</dt>
              <dd>{formatDurationSeconds(identity.tokenExp)}</dd>
            </div>
          </dl>
          <div className="identity-roles">
            <span className="field-count">App roles from the verified SDK token</span>
            <RoleChips roles={writeRoles} />
          </div>
          {identity.tideuserkey ? (
            <details className="inline-details">
              <summary>Tide user key (policy subject for a write grant)</summary>
              <p className="mono">{identity.tideuserkey}</p>
            </details>
          ) : (
            <p className="field-hint">
              The access token did not expose a tideuserkey. The API still binds grants to the
              writer key stored on the server-created draft.
            </p>
          )}
        </article>

        <article className="panel">
          <span className="eyebrow">REPORT PATH</span>
          <h2>Four evidence states</h2>
          <ol className="step-list">
            <li>
              <span>1</span>
              <div>
                <strong>Draft persisted</strong>
                <p>The API creates the revision, assignment tag and owner context first.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Grants initialized and signed</strong>
                <p>An administrator opens the Tide enclave for the exact record; signed bytes are stored.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Plaintext encrypted</strong>
                <p>The researcher encrypts with the stored signed write grant and posts ciphertext only.</p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>Vendor decrypts</strong>
                <p>The selected vendor uses the stored read grant, then checks the decrypted context.</p>
              </div>
            </li>
          </ol>
        </article>

        <article className="panel">
          <span className="eyebrow">HONEST LIMITS</span>
          <h2>What this build does not claim</h2>
          <ul className="limit-list">
            <li>No tamper-proof audit: the local activity table is owned by the database operator.</li>
            <li>Routing metadata, status, timing and ciphertext sizes remain visible.</li>
            <li>A missing operation role or app filter is not proof that policy issuance is governed.</li>
            <li>No signature is generated by this interface; it only relays genuine SDK results.</li>
            <li>No plaintext is saved to storage, URLs, logs or telemetry.</li>
          </ul>
          <p className="field-hint">
            Real realm enforcement and the one-admin versus two-admin behaviour remain runtime checks
            for the operator and governance surfaces.
          </p>
        </article>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">SETUP / OVERVIEW</span>
            <h2>Trusted configuration status</h2>
            <p>
              The provider is mounted only after <code>/api/setup</code> returns a valid public
              adapter. Missing configuration never becomes a fake login.
            </p>
          </div>
          <span className={`pill pill-${checks.length > 0 && ready === checks.length ? "positive" : "attention"}`}>
            {ready}/{checks.length || 0} ready
          </span>
        </div>
        <CheckSummary setup={setup} onOpen={() => navigate("/setup")} />
        <dl className="inline-meta">
          <div>
            <dt>Browser origin</dt>
            <dd className="mono">{setup?.appOrigin || "not reported"}</dd>
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
    </div>
  );
}
