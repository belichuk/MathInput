import { useState } from "react";
import { MathInput } from "./MathInput";

const initialExpression = "\\frac{1}{2} + x^{2} + \\sqrt{9}";

export function Demo() {
  const [latex, setLatex] = useState(initialExpression);
  const [copied, setCopied] = useState(false);

  const copyValue = async () => {
    await navigator.clipboard?.writeText(latex);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="demo-shell">
      <section className="demo-hero" aria-labelledby="demo-title">
        <div className="demo-index" aria-hidden="true">
          <span>MI</span>
          <i />
          <span>01</span>
        </div>
        <div className="demo-intro">
          <p className="demo-kicker">Raw expression editor</p>
          <h1 id="demo-title">Math, kept<br />as text.</h1>
          <p className="demo-lede">
            A native input for writing KaTeX strings without a parser, renderer, or dependency chain.
          </p>
        </div>
      </section>

      <section className="workbench" aria-label="MathInput demonstration">
        <div className="workbench__header">
          <div>
            <p className="workbench__eyebrow">Try the input</p>
            <h2>Expression</h2>
          </div>
          <span className="workbench__status"><b /> Plain text only</span>
        </div>

        <MathInput value={latex} onChange={setLatex} className="demo-math-input" />

        <div className="workbench__footer">
          <p>Use <kbd>/</kbd> for fractions · <kbd>^</kbd> for powers · type <code>\sqrt</code> for roots</p>
          <button type="button" onClick={copyValue} className="copy-button">
            {copied ? "Copied" : "Copy raw string"}
          </button>
        </div>
      </section>

      <section className="output-ledger" aria-live="polite" aria-label="Raw KaTeX output">
        <div className="output-ledger__label">
          <span>Output</span>
          <span>KaTeX-compatible</span>
        </div>
        <pre>{latex || "—"}</pre>
      </section>

      <footer className="demo-footer">
        <span>Native input · native selection</span>
        <span>⌘V works, too</span>
      </footer>
    </main>
  );
}
