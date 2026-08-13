/** Temporary Stage-1 scaffolding: renders the new tree renderer beside the live component for visual diffing. Deleted at cutover. */
import { MathInput } from "../src";
import { parseLatex } from "../src/parse";
import { renderNodes } from "../src/render";
import { serializeToLatex } from "../src/serialize";

const SAMPLES = [
  "\\sqrt{9+16}+10^{2}-\\frac{1}{2}",
  "\\frac{\\sqrt{2}}{\\frac{1}{2}}+x^{2}",
  "\\sqrt{}+\\frac{}{}+^{}",
  "\\frac{1+\\sqrt{\\frac{3}{4}}}{2\\times x}",
  "\\sqrt[3]{8}+x_{i}^{2}+\\left(9+16\\right)",
  "\\left(\\frac{1}{2}+\\sqrt{5}\\right)^{2}",
  "1+2=3",
];

export function RenderPreview() {
  return <section className="demo-panel" aria-label="Renderer preview">
    <div className="demo-panel-heading"><h2>Renderer preview</h2><span>old (live component) vs new (tree)</span></div>
    {SAMPLES.map((sample) => {
      const nodes = parseLatex(sample);
      return <div key={sample} style={{ display: "grid", gap: "0.5rem", padding: "0.5rem 0", borderTop: "1px solid #dbe4ef" }}>
        <code style={{ fontSize: "0.75rem", color: "#8094b2" }}>{sample}{serializeToLatex(nodes) === sample ? "" : ` → ${serializeToLatex(nodes)}`}</code>
        <MathInput defaultValue={sample} />
        <div className="math-input">
          <div className="math-input__frame">
            <div className="math-input__row">
              <div className="math-input__field">{renderNodes(nodes)}</div>
            </div>
          </div>
        </div>
      </div>;
    })}
  </section>;
}
