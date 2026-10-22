export default function DisclosureScene() {
  return (
    <figure className="disclosure-scene" aria-label="Illustration of a report passing from researcher through encrypted storage to its vendor">
      <div className="scene-orbit" aria-hidden="true" />
      <div className="scene-side scene-author">
        <span className="scene-icon" aria-hidden="true">↗</span>
        <span className="scene-caption">Researcher</span>
        <strong>A finding worth protecting.</strong>
        <p>Written here.<br />Encrypted before sending.</p>
      </div>
      <div className="scene-board">
        <div className="scene-toolbar"><span><i /> Embargo / disclosure channel</span><span className="scene-lock">◇</span></div>
        <div className="scene-board-body">
          <div className="scene-heading"><span className="scene-icon">E</span><div><strong>Confidential by design</strong><span>Researcher to vendor</span></div><span className="scene-tag">Encrypted</span></div>
          <div className="scene-payload"><span>Report contents</span><div aria-hidden="true"><b /><b /><b /><b /><b /><b /><b /><b /><b /><b /><b /><b /></div><p>Title, severity, details & proof of concept</p></div>
          <div className="scene-route"><span>Prepare</span><i /><span>Encrypt</span><i /><span>Deliver</span></div>
          <div className="scene-footer"><span className="scene-dot" /> Read access follows the report policy</div>
        </div>
      </div>
      <div className="scene-side scene-recipient">
        <span className="scene-icon" aria-hidden="true">⌘</span>
        <span className="scene-caption">Selected vendor</span>
        <strong>The right team.<br />The full picture.</strong>
        <p>Decrypt, investigate,<br />and work toward a fix.</p>
      </div>
      <figcaption>Workflow illustration · no live report data</figcaption>
    </figure>
  );
}
