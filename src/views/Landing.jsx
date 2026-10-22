import { useState } from "react";
import { ErrorPanel, Notice } from "../components/ui.jsx";
import { SetupChecks } from "./SetupView.jsx";
import DisclosureScene from "../components/DisclosureScene.jsx";

export default function Landing({ setup, sdk }) {
  const [loginError, setLoginError] = useState(null);
  const [starting, setStarting] = useState(false);
  const checks = Array.isArray(setup?.checks) ? setup.checks : [];
  async function startLogin() {
    setStarting(true);
    setLoginError(null);
    try { await sdk.login(); }
    catch (error) { setLoginError(error); }
    finally { setStarting(false); }
  }
  const busy = starting || sdk.isLoading;

  return (
    <div className="landing-shell">
      <div className="landing-frame">
        <header className="landing-top">
          <a className="public-brand" href="/" aria-label="Embargo home"><span className="brand-mark" aria-hidden="true">E</span><strong>Embargo</strong></a>
          <nav className="landing-nav" aria-label="Explore Embargo"><a href="#platform">Platform</a><a href="#workflow">How it works</a><a href="#access">Access</a></nav>
          <button className="btn btn-primary" type="button" onClick={startLogin} disabled={busy}>{busy ? "Opening…" : "Sign in"}<span aria-hidden="true">↗</span></button>
        </header>
        <main id="main" className="landing-main">
          <section className="landing-hero" id="platform">
            <div className="landing-headline"><span className="channel-label"><i /> Confidential disclosure</span><h1>Sensitive findings.<br />Shared with care.</h1></div>
            <div className="landing-intro"><p>A private channel between the people who find vulnerabilities and the teams who fix them. Encrypted in your browser. Routed through Embargo.</p><div className="landing-actions"><button className="btn btn-primary" type="button" onClick={startLogin} disabled={busy}>{busy ? "Opening TideCloak…" : "Open your workspace"}<span aria-hidden="true">↗</span></button><a className="quiet-link" href="#workflow">Explore the workflow <span aria-hidden="true">↘</span></a></div></div>
          </section>
          {sdk.initError ? <ErrorPanel error={sdk.initError} title="Could not connect to TideCloak" onRetry={() => sdk.reload()} retryLabel="Retry connection" /> : null}
          {loginError ? <ErrorPanel error={loginError} title="Sign-in could not start" /> : null}
          {sdk.sessionExpired && !sdk.authenticated ? <Notice tone="info" title="Your session has ended">Sign in again to return to your workspace.</Notice> : null}
          <DisclosureScene />
          <section className="landing-workflow" id="workflow">
            <div className="landing-section-heading"><span className="channel-label">From discovery to resolution</span><h2>Less exposure.<br />A clearer path forward.</h2><p>Keep the details private while the work moves ahead.</p></div>
            <div className="workflow-grid">
              <article><span className="workflow-number">01 / Prepare</span><h3>Give your finding a destination.</h3><p>Choose a vendor and create a report. Record-specific write and read policies are reviewed before you send it.</p></article>
              <article><span className="workflow-number">02 / Protect</span><h3>Send the report encrypted.</h3><p>Your browser encrypts the title, severity, details and proof of concept. The exchange stores ciphertext and routing metadata.</p></article>
              <article><span className="workflow-number">03 / Resolve</span><h3>Move from triage to a fix.</h3><p>The selected vendor decrypts with its read policy. Researchers follow progress without exposing the finding to storage.</p></article>
            </div>
          </section>
          <section className="landing-access" id="access">
            <div><span className="channel-label">Your account. Your workspace.</span><h2>Ready to pick up the thread?</h2><p>Sign in with your researcher, vendor or administrator TideCloak account.</p><button className="btn btn-primary" type="button" onClick={startLogin} disabled={busy}>{busy ? "Opening…" : "Continue with TideCloak"}<span aria-hidden="true">↗</span></button></div>
            <details className="connection-details"><summary>Connection & prototype details</summary><p>Configuration readiness does not verify live signing, encryption, decryption or resistance to a lone administrator. Use synthetic findings only. Routing metadata remains visible; recipients can retain decrypted content.</p><SetupChecks checks={checks} /><dl className="meta-grid"><div><dt>Browser origin</dt><dd>{setup?.appOrigin || "not reported"}</dd></div><div><dt>API audience</dt><dd>{setup?.apiAudience || "not reported"}</dd></div><div className="span-all"><dt>Realm issuer</dt><dd>{setup?.realmIssuer || "not reported"}</dd></div></dl></details>
          </section>
        </main>
        <footer className="landing-footer"><span>Embargo</span><span>Confidential disclosure, thoughtfully connected.</span><span>Synthetic findings only / Prototype</span></footer>
      </div>
    </div>
  );
}
